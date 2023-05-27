import os
import tkinter as tk
from tkinter import ttk

import meta
import util

main = ttk.Frame()
main.pack(fill="both")

if util.is_darwin:
    path_mono = "/Library/Frameworks/Mono.framework/Versions/Current/Commands/mono"
else:
    path_mono = "mono"

vars_spec = {
    "mono": {"type": tk.StringVar, "value": path_mono},
    "data": {"type": tk.StringVar, "value": ""},
    "out": {"type": tk.StringVar, "value": ""},
}
task = util.Task("ThermoRawRead", vars_spec, path=meta.homedir)
V = task.vars

def run():
    for p in V["data"].get().split(";"):
        task.call(*([] if util.is_windows else [V["mono"].get()]),
            util.get_content("ThermoRawRead", "ThermoRawRead.exe", shared=True, zipped=True),
            p, V["out"].get(),
        )

util.init_form(main)
I = 0
t = (("Thermo RAW", "*.raw"), ("All", "*.*"))
util.add_entry(main, I, "Data:", V["data"], "Select", util.askfiles(V["data"], V["out"], filetypes=t))
I += 1
util.add_entry(main, I, "Output Directory:", V["out"], "Select", util.askdir(V["out"]))
I += 1
task.init_ctrl(ttk.Frame(main), run).grid(column=0, row=I, columnspan=3)
I += 1
if not util.is_windows:
    ttk.Separator(main, orient=tk.HORIZONTAL).grid(column=0, row=I, columnspan=3, sticky="EW")
    ttk.Label(main, text="Advanced Configuration").grid(column=0, row=I, columnspan=3)
    I += 1
    util.add_entry(main, I, "Mono Runtime:", V["mono"], "Select", util.askfile(V["mono"]))
    I += 1
