import os
import tkinter as tk
from tkinter import ttk

import meta
import util

main = ttk.Frame()
main.pack(fill="both")

fmts = ["UMZ: unified, fast and small mass spectrum format", "MSx: human-friendly text format"]
fmt_codes = ["umz", "msx"]
vars_spec = {
    "data": {"type": tk.StringVar, "value": ""},
    "fmt": {"type": tk.StringVar, "value": fmts[0]},
    "out": {"type": tk.StringVar, "value": ""},
}
task = util.Task("ThermoRawRead", vars_spec, path=meta.homedir)
V = task.vars

def run():
    for p in V["data"].get().split(";"):
        task.call(util.get_content("ThermoRawRead", zipped=True),
            fmt_codes[fmts.index(V["fmt"].get())],
            p, V["out"].get(),
        )

util.init_form(main)
I = 0
t = (("Thermo RAW", "*.raw"), ("All", "*.*"))
util.add_entry(main, I, "Data:", V["data"], "Select", util.askfiles(V["data"], V["out"], filetypes=t))
I += 1
util.add_entry(main, I, "Format:", ttk.Combobox(main, textvariable=V["fmt"], values=fmts, state="readonly", justify="center"))
I += 1
util.add_entry(main, I, "Output Directory:", V["out"], "Select", util.askdir(V["out"]))
I += 1
task.init_ctrl(ttk.Frame(main), run).grid(column=0, row=I, columnspan=3)
I += 1
