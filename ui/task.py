import os
import threading
import tkinter as tk
from tkinter import ttk, filedialog

import meta
import util

handles = []
running = False
skip_rest = False

path_autosave = os.path.join(meta.homedir, "autosave.task")

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
vars = {k: v["type"](value=v["value"]) for k, v in vars_spec.items()}
util.load_task(path_autosave, vars)

row = 0
util.init_form(main)

def do_select_data():
    filetypes = (("Thermo RAW", "*.raw"), ("All", "*.*"))
    files = filedialog.askopenfilenames(filetypes=filetypes)
    if len(files) == 0:
        return None
    elif len(files) > 1:
        print("multiple data selected:")
        for file in files: print(">>", file)
    vars["data"].set(";".join(files))
    if len(vars["data"].get()) > 0 and len(vars["out"].get()) == 0:
        vars["out"].set(os.path.dirname(files[0]))

util.add_entry(main, row, "RAW Data:", vars["data"], "Select", do_select_data)
row += 1

util.add_entry(main, row, "Output Directory:", vars["out"], "Select", util.askdir(vars["out"]))
row += 1

def do_run():
    btn_run.config(state="disabled")
    global handles, running, skip_rest
    running = True
    skip_rest = False
    util.save_task(path_autosave, {k: v for k, v in vars.items() if v.get() != vars_spec[k]["value"]})
    for p in vars["data"].get().split(";"):
        cmd = [util.get_content("ThermoRawRead", "ThermoRawRead.exe", shared=True, zipped=True)]
        cmd = cmd + [p, vars["out"].get()]
        if not util.is_windows:
            cmd = [vars["mono"].get()] + cmd
        util.run_cmd(cmd, handles, skip_rest)
    running = False
    btn_run.config(state="normal")

def do_stop():
    global handles, running, skip_rest
    skip_rest = True
    for job in handles:
        if job.poll() is None:
            job.terminate()
    running = False
    handles.clear()
    btn_run.config(state="normal")
    print("ThermoRawRead stopped.")

frm_btn = ttk.Frame(main)
frm_btn.grid(column=0, row=row, columnspan=3)
btn_run = ttk.Button(frm_btn, text="RUN", command=lambda: threading.Thread(target=do_run).start(), width=16)
btn_run.grid(column=0, row=0, padx=16, pady=8)
ttk.Button(frm_btn, text="STOP", command=lambda: threading.Thread(target=do_stop).start(), width=16).grid(column=1, row=0, padx=16, pady=8)
row += 1

if not util.is_windows:
    ttk.Separator(main, orient=tk.HORIZONTAL).grid(column=0, row=row, columnspan=3, sticky="EW")
    ttk.Label(main, text="Advanced Configuration").grid(column=0, row=row, columnspan=3)
    row += 1

    util.add_entry(main, row, "Mono Runtime:", vars["mono"], "Select", util.askfile(vars["mono"]))
    row += 1
