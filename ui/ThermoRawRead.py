import os
import threading
import tkinter as tk
from tkinter import ttk

import ttkbootstrap

import meta
import util

os.makedirs(meta.homedir, exist_ok=True)

win = tk.Tk()
win.title(meta.name)
win.iconphoto(True, tk.PhotoImage(file=util.get_content(f"{meta.name}.png", shared=True, zipped=True)))
win.resizable(False, False)

main = ttk.Frame(win)
main.pack(padx=16, pady=8)
var = tk.StringVar()
threading.Thread(target=lambda: util.show_headline(var, meta.server)).start()
ttk.Label(main, textvariable=var, justify="center").pack()
notebook = ttk.Notebook(main)
notebook.pack(fill="x")
util.add_console(main, height=24).pack(fill="x")
ttk.Label(main, text=meta.copyright, justify="center").pack()

import task
notebook.add(task.main, text="ThermoRawRead")

util.bind_exit(win, [task,])
util.center_window(win)
tk.mainloop()
