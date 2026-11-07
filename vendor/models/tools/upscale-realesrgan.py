#!/usr/bin/env python3
"""Converts Real-ESRGAN x4plus (xinntao/Real-ESRGAN, BSD-3-Clause) from its PyTorch weights to ONNX.

Usage (scratch directory, CPU torch):
  python3 -I upscale-realesrgan.py RealESRGAN_x4plus.pth out-model.onnx

The network is RRDBNet (23 RRDB blocks, 64 features, 32 growth channels, x4), rebuilt here with the same
module names as the official checkpoint key set, then loaded from "params_ema". Input "input" is RGB NCHW
in [0,1] with dynamic H and W; output "output" is [1,3,4H,4W]. The export is checked against PyTorch on a
random input (max abs error must stay below 1e-4). The file is written unchanged for the same inputs.
"""
import sys
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import onnx
import onnxruntime as ort


class ResidualDenseBlock(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.rdb1 = ResidualDenseBlock(nf, gc)
        self.rdb2 = ResidualDenseBlock(nf, gc)
        self.rdb3 = ResidualDenseBlock(nf, gc)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, nf=64, nb=23, gc=32):
        super().__init__()
        self.conv_first = nn.Conv2d(3, nf, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(nf, gc) for _ in range(nb)])
        self.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


def main(argv):
    if len(argv) != 2:
        raise SystemExit(__doc__)
    src, out = argv
    net = RRDBNet()
    ckpt = torch.load(src, map_location='cpu', weights_only=True)
    net.load_state_dict(ckpt['params_ema'], strict=True)
    net.eval()
    dummy = torch.zeros(1, 3, 64, 64)
    torch.onnx.export(net, dummy, out, input_names=['input'], output_names=['output'], opset_version=17,
                      dynamo=False, dynamic_axes={'input': {2: 'H', 3: 'W'}, 'output': {2: 'H4', 3: 'W4'}})
    x = np.random.RandomState(3).rand(1, 3, 37, 50).astype(np.float32)
    with torch.no_grad():
        ref = net(torch.from_numpy(x)).numpy()
    sess = ort.InferenceSession(out, providers=['CPUExecutionProvider'])
    got = sess.run(['output'], {'input': x})[0]
    err = float(np.abs(got - ref).max())
    if got.shape != ref.shape or err > 1e-4:
        raise SystemExit(f'mismatch: shape {got.shape} vs {ref.shape}, max error {err}')
    onnx.checker.check_model(out)
    print(f'ok: max abs error {err:.2e}, output {got.shape}, wrote {out}')


if __name__ == '__main__':
    main(sys.argv[1:])
