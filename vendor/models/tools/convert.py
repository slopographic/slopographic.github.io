"""Rebuild the Slop Cutout model files from the upstream ONNX releases (see ../README.md).

    pip install onnx numpy
    python convert.py <upstream-dir> <out-dir>

<upstream-dir> holds u2netp.onnx and isnet-general-use.onnx exactly as downloaded.
Three transformations:
  1. prune: keep only the final saliency output (U2-Net/IS-Net also export their side outputs and,
     for IS-Net, five large feature maps that would cost ~100 MB of memory per run in the browser);
  2. weight-only int8 (IS-Net only): every Conv weight is stored as int8 with one float32 scale per
     output channel and expanded back with DequantizeLinear, so the math stays float32.
  3. MaxPool(kernel 2, stride 2, ceil_mode=1) → MaxPool(ceil_mode=0, end pads 1): identical output for
     every input size, but the WebGPU backend of ONNX Runtime Web cannot run ceil_mode (U²-Netp, IS-Net).
MODNet is shipped unchanged.
"""
import os, sys
import numpy as np
import onnx
from onnx import helper, numpy_helper


def prune(model, keep):
    g = model.graph
    outs = [o for o in g.output if o.name == keep]
    del g.output[:]
    g.output.extend(outs)
    needed, nodes = {keep}, []
    for n in reversed(g.node):
        if any(o in needed for o in n.output):
            nodes.append(n)
            needed.update(n.input)
    nodes.reverse()
    del g.node[:]
    g.node.extend(nodes)
    inits = [i for i in g.initializer if i.name in needed]
    del g.initializer[:]
    g.initializer.extend(inits)
    return model


def weight_int8(model):
    g = model.graph
    inits = {i.name: i for i in g.initializer}
    conv_w = {n.input[1] for n in g.node if n.op_type == 'Conv' and len(n.input) > 1}
    dq = []
    for name in sorted(conv_w):
        if name not in inits:
            continue
        w = numpy_helper.to_array(inits[name]).astype(np.float32)
        if w.ndim != 4 or w.size < 1024:
            continue
        amax = np.abs(w.reshape(w.shape[0], -1)).max(axis=1)
        scale = np.where(amax > 0, amax / 127.0, 1.0).astype(np.float32)
        q = np.clip(np.round(w / scale[:, None, None, None]), -127, 127).astype(np.int8)
        g.initializer.remove(inits[name])
        g.initializer.extend([numpy_helper.from_array(q, name + '_q'), numpy_helper.from_array(scale, name + '_s'),
                              numpy_helper.from_array(np.zeros(w.shape[0], np.int8), name + '_z')])
        dq.append(helper.make_node('DequantizeLinear', [name + '_q', name + '_s', name + '_z'], [name], axis=0, name=name + '_dq'))
    nodes = list(g.node)
    del g.node[:]
    g.node.extend(dq + nodes)
    for o in model.opset_import:
        if o.domain in ('', 'ai.onnx') and o.version < 13:
            o.version = 13
    return model


def no_ceil(model):
    for n in model.graph.node:
        if n.op_type != 'MaxPool':
            continue
        a = {x.name: helper.get_attribute_value(x) for x in n.attribute}
        if a.get('ceil_mode') == 1 and list(a.get('kernel_shape', [])) == [2, 2] and list(a.get('strides', [])) == [2, 2] and not any(a.get('pads', [0])):
            for x in n.attribute:
                if x.name == 'ceil_mode':
                    x.i = 0
                elif x.name == 'pads':
                    del x.ints[:]
                    x.ints.extend([0, 0, 1, 1])
    return model


def main(src, out):
    os.makedirs(out, exist_ok=True)
    m = no_ceil(prune(onnx.load(os.path.join(src, 'u2netp.onnx')), '1959'))
    onnx.checker.check_model(m)
    onnx.save(m, os.path.join(out, 'u2netp.onnx'))
    m = no_ceil(weight_int8(prune(onnx.load(os.path.join(src, 'isnet-general-use.onnx')), 'output_image')))
    onnx.checker.check_model(m)
    onnx.save(m, os.path.join(out, 'isnet-general-w8.onnx'))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
