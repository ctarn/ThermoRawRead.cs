import os
import sys
import threading
import tkinter as tk
from tkinter import ttk, filedialog, scrolledtext

import meta
import util

handles = []
running = False
skip_rest = False

os.makedirs(meta.homedir, exist_ok=True)
path_autosave = os.path.join(meta.homedir, "autosave.task")

win = tk.Tk()
win.title(meta.name)
win.iconphoto(True, tk.PhotoImage(file=util.get_content(f"{meta.name}.png", shared=True, zipped=True)))
win.resizable(False, False)
main = ttk.Frame(win)
main.grid(column=0, row=0, padx=16, pady=8)

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

row = 0
# headline
row += 1

def do_select_mono():
    path = filedialog.askopenfilename()
    if len(path) > 0: vars["mono"].set(path)

if not util.is_windows:
    ttk.Label(main, text="Mono Runtime:").grid(column=0, row=row, sticky="W")
    ttk.Entry(main, textvariable=vars["mono"]).grid(column=1, row=row, sticky="WE")
    ttk.Button(main, text="Select", command=do_select_mono).grid(column=2, row=row, sticky="W")
    row += 1

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

ttk.Label(main, text="RAW Data:").grid(column=0, row=row, sticky="W")
ttk.Entry(main, textvariable=vars["data"], width=40).grid(column=1, row=row, sticky="WE")
ttk.Button(main, text="Select", command=do_select_data).grid(column=2, row=row, sticky="W")
row += 1

def do_select_out():
    path = filedialog.askdirectory()
    if len(path) > 0: vars["out"].set(path)

ttk.Label(main, text="Output Directory:").grid(column=0, row=row, sticky="W")
ttk.Entry(main, textvariable=vars["out"]).grid(column=1, row=row, sticky="WE")
ttk.Button(main, text="Select", command=do_select_out).grid(column=2, row=row, sticky="W")
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
btn_run = ttk.Button(frm_btn, text="RUN", command=lambda: threading.Thread(target=do_run).start())
btn_run.grid(column=0, row=0, padx=16, pady=8)
ttk.Button(frm_btn, text="STOP", command=lambda: threading.Thread(target=do_stop).start()).grid(column=1, row=0, padx=16, pady=8)
row += 1

console = scrolledtext.ScrolledText(main, height=16)
console.config(state="disabled")
console.grid(column=0, row=row, columnspan=3, sticky="WE")
row += 1

ttk.Label(main, text=meta.copyright, justify="center").grid(column=0, row=row, columnspan=3)

sys.stdout = util.Console(console)
sys.stderr = util.Console(console)

if getattr(sys, 'frozen', False):
    threading.Thread(target=lambda: util.show_headline(meta.server, main, columnspan=3)).start()

def on_delete():
    if (not running) or tk.messagebox.askokcancel("Quit", "Task running. Quit now?"):
        do_stop()
        win.destroy()

util.load_task(path_autosave, vars)

win.protocol("WM_DELETE_WINDOW", on_delete)

tk.mainloop()
