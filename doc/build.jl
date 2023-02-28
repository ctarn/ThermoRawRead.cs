import LibGit2

import Documenter

repo = "github.com/ctarn/ThermoRawRead.cs.git"

root = "doc"
out = joinpath("tmp", "doc")

rm(out; force=true, recursive=true)
LibGit2.clone("https://$(repo)", out, branch="gh-pages")
rm(joinpath(out, ".git"); force=true, recursive=true)

vs = readdir(joinpath(root, "log")) .|> splitext .|> first .|> VersionNumber
sort!(vs; rev=true)
logs = map(vs) do v in
    "<li> version $(v):<div>$(read(joinpath(root, "log", "$(v).html"), String))</div></li>"
end

html = read(joinpath(root, "index.html"), String)
html = replace(html, "{{ release }}" => "<ul>$(join(logs))</ul>")
open(io -> write(io, html), joinpath(out, "index.html"); write=true)

open(io -> write(io, "thermorawread.ctarn.io"), joinpath(out, "CNAME"); write=true)

Documenter.deploydocs(repo=repo, target=joinpath("..", out), versions=nothing)

Documenter.makedocs(sitename="ThermoRawRead", build=joinpath("..", out))
Documenter.deploydocs(repo=repo, target=joinpath("..", out), dirname="doc")
