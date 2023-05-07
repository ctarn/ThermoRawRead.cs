name="ThermoRawRead"
content="tmp/shared"
out="tmp/release/$name-$(cat VERSION).$(uname -m).$(uname -s)"
rm -rf $out
pyinstaller ui/$name.py -Fwy -i fig/$name.png --distpath $out --workpath tmp/build \
    --add-data $content:content \
    --hidden-import "PIL._tkinter_finder"
rm -rf $name.spec
