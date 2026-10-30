#!/usr/bin/env python3
"""Converts the FSRCNN x2 / x4 TensorFlow graphs (Saafke/FSRCNN_Tensorflow, Apache-2.0) to ONNX.

Usage (from a scratch directory, never inside the repo):
  python3 -I upscale-fsrcnn.py <FSRCNN_x2.pb> <out-fsrcnn-x2.onnx> <FSRCNN_x4.pb> <out-fsrcnn-x4.onnx>

Only the weights are read from the TensorFlow graph (tensorflow-cpu is needed for that). The ONNX graph is
rebuilt with onnx.helper: Conv (SAME padding, stride 1), PRelu (per channel), DepthToSpace in DCR mode (the
TensorFlow DepthToSpace order), and the final bias. Input "input" is NCHW [1,1,H,W] Y channel in [0,1]; output
"output" is [1,1,H*s,W*s]. Each file is checked against the TensorFlow graph on a random input (max abs error
must stay below 1e-4) before it is written. Output is deterministic: same inputs give the same bytes.
"""
import sys
import numpy as np
import onnx
import tensorflow as tf
from onnx import TensorProto, helper, numpy_helper
import onnxruntime as ort


def read_graph(path):
    gd = tf.compat.v1.GraphDef()
    with open(path, 'rb') as f:
        gd.ParseFromString(f.read())
    return gd


def consts(gd):
    out = {}
    for n in gd.node:
        if n.op == 'Const':
            out[n.name] = tf.make_ndarray(n.attr['value'].tensor)
    return out


def build(gd, scale):
    c = consts(gd)
    inits, nodes = [], []

    def init(name, arr):
        inits.append(numpy_helper.from_array(np.ascontiguousarray(arr.astype(np.float32)), name))
        return name

    def conv(i, x, k):
        w = c[f'f{k}']                      # TF HWIO
        kh, kw = w.shape[0], w.shape[1]
        wname = init(f'W{k}', np.transpose(w, (3, 2, 0, 1)))   # ONNX OIHW
        # conv8 has no bias: b8 is added after DepthToSpace (it has one value)
        bias = c[f'b{k}'].reshape(-1) if k != 8 else np.zeros(w.shape[3], np.float32)
        bname = init(f'B{k}', bias)
        y = f'conv{k}_out'
        nodes.append(helper.make_node('Conv', [x, wname, bname], [y], name=f'conv{k}',
                                      kernel_shape=[kh, kw], strides=[1, 1],
                                      pads=[kh // 2, kw // 2, kh // 2, kw // 2]))
        return y

    def prelu(i, x, k):
        a = init(f'alpha{k}', c[f'alpha{k}'].reshape(-1, 1, 1))
        y = f'act{k}_out'
        nodes.append(helper.make_node('PRelu', [x, a], [y], name=f'prelu{k}'))
        return y

    x = 'input'
    for k in range(1, 8):
        x = prelu(k, conv(k, x, k), k)
    x = conv(8, x, 8)
    nodes.append(helper.make_node('DepthToSpace', [x], ['d2s_out'], name='depth_to_space',
                                  blocksize=scale, mode='DCR'))
    b8 = init('B8_final', c['b8'].reshape(1, 1, 1, 1))
    nodes.append(helper.make_node('Add', ['d2s_out', b8], ['output'], name='bias_out'))
    graph = helper.make_graph(
        nodes, f'fsrcnn_x{scale}', [helper.make_tensor_value_info('input', TensorProto.FLOAT, ['N', 1, 'H', 'W'])],
        [helper.make_tensor_value_info('output', TensorProto.FLOAT, ['N', 1, 'H', 'W'])], initializer=inits)
    model = helper.make_model(graph, producer_name='slopographic', opset_imports=[helper.make_opsetid('', 13)])
    model.ir_version = 8
    return model


def check(gd, model, scale):
    g = tf.Graph()
    with g.as_default():
        tf.import_graph_def(gd, name='')
    rng = np.random.RandomState(7)
    x_nchw = rng.rand(1, 1, 37, 23).astype(np.float32)
    with tf.compat.v1.Session(graph=g) as s:
        ref = s.run(g.get_tensor_by_name('NCHW_output:0'),
                    {g.get_tensor_by_name('IteratorGetNext:0'): np.transpose(x_nchw, (0, 2, 3, 1))})
    sess = ort.InferenceSession(model.SerializeToString(), providers=['CPUExecutionProvider'])
    got = sess.run(['output'], {'input': x_nchw})[0]
    err = float(np.abs(got - ref).max())
    if got.shape != ref.shape or err > 1e-4:
        raise SystemExit(f'x{scale}: mismatch shape {got.shape} vs {ref.shape}, max error {err}')
    print(f'x{scale}: ok, max abs error {err:.2e}, output {got.shape}')


def main(argv):
    if len(argv) != 4:
        raise SystemExit(__doc__)
    for pb, out, scale in ((argv[0], argv[1], 2), (argv[2], argv[3], 4)):
        gd = read_graph(pb)
        model = build(gd, scale)
        check(gd, model, scale)
        onnx.checker.check_model(model)
        onnx.save(model, out)
        print('wrote', out)


if __name__ == '__main__':
    main(sys.argv[1:])
