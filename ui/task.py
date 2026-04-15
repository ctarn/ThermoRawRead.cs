import os
import tkinter as tk
from tkinter import ttk

import meta
import util

main = ttk.Frame()
main.pack(fill="both")

outputs = [
    ("umz", "UMZ", "Unified Binary Spectrum Format"),
    ("csv", "CSV", "Scan List without Peaks"),
    ("txt", "TXT", "Run Metadata"),
    ("meth", "METH", "Instrument Method File"),
    ("ms1", "MS1", "Text Spectrum Format"),
    ("ms2", "MS2", "Text Spectrum Format"),
]
default_outputs = {"umz", "meth", "txt", "csv"}
vars_spec = {
    "data": {"type": tk.StringVar, "value": ""},
    "out": {"type": tk.StringVar, "value": ""},
}
for code, _, _ in outputs:
    vars_spec[f"fmt_{code}"] = {"type": tk.BooleanVar, "value": code in default_outputs}
task = util.Task("ThermoRawRead", vars_spec, path=meta.homedir)
V = task.vars

def run():
    paths = split_paths(V["data"].get())
    if len(paths) == 0:
        print("at least one input path is required")
        return

    cmd = [util.get_content("ThermoRawRead", zipped=True)]
    cmd.extend([f"--{code}" for code, _, _ in outputs if V[f"fmt_{code}"].get()])
    if V["recursive"].get():
        cmd.append("--recursive")
    if len(V["out"].get()) > 0:
        cmd.extend(["--out", V["out"].get()])
    cmd.extend(paths)
    task.call(*cmd)


util.init_form(main)
I = 0
t = (("Thermo RAW", "*.raw"), ("All", "*.*"))
util.add_entry(main, I, "Data:", V["data"], "Select", util.askfiles(V["data"], V["out"], filetypes=t))
I += 1

util.add_entry(main, I, "Output Directory:", V["out"], "Select", util.askdir(V["out"]))
I += 1

util.add_separator(main, I, "Output Format")
I += 1

fmt_frame = ttk.Frame(main)
fmt_frame.grid(column=1, row=I, sticky="W")
for index, (code, title, desc) in enumerate(outputs):
    ttk.Checkbutton(fmt_frame, text=f"{title}: {desc}", variable=V[f"fmt_{code}"]).grid(column=index % 2, row=index // 2, sticky="W", padx=4, pady=2)
I += 1

task.init_ctrl(ttk.Frame(main), run).grid(column=0, row=I, columnspan=3)
I += 1
