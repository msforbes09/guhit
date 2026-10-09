"""Splits an ONNX model's weights into external-data files of at most --max-mb
each, named the way Transformers.js loads them: "<name>.onnx_data",
"<name>.onnx_data_1", ... (its use_external_data_format option is the count).
Used because a single upload to Cloudflare R2 is capped at 300 MiB.

    python3 scripts/split-onnx.py <in.onnx> <out.onnx> [--max-mb 280]

Needs the "onnx" package (pip install onnx); prints the number of data files.
"""

import argparse
import os

import onnx
from onnx import TensorProto


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("src")
    parser.add_argument("dst")
    parser.add_argument("--max-mb", type=float, default=280)
    args = parser.parse_args()

    model = onnx.load(args.src)
    limit = int(args.max_mb * 1e6)
    folder, base = os.path.split(args.dst)

    def data_name(index: int) -> str:
        return f"{base}_data" if index == 0 else f"{base}_data_{index}"

    chunk, offset = 0, 0
    out = open(os.path.join(folder, data_name(0)), "wb")
    for tensor in model.graph.initializer:
        # Small tensors (and ones not stored as raw bytes) stay inside the graph file.
        if not tensor.HasField("raw_data") or len(tensor.raw_data) < 1024:
            continue
        size = len(tensor.raw_data)
        if offset > 0 and offset + size > limit:
            out.close()
            chunk, offset = chunk + 1, 0
            out = open(os.path.join(folder, data_name(chunk)), "wb")
        out.write(tensor.raw_data)
        del tensor.external_data[:]
        tensor.data_location = TensorProto.EXTERNAL
        for key, value in (("location", data_name(chunk)), ("offset", str(offset)), ("length", str(size))):
            entry = tensor.external_data.add()
            entry.key, entry.value = key, value
        tensor.ClearField("raw_data")
        offset += size
    out.close()
    onnx.save(model, args.dst)
    print(chunk + 1)


if __name__ == "__main__":
    main()
