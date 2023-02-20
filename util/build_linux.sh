name="ThermoRawRead"
content="tmp/shared"
out="tmp/release/$name-$(cat VERSION).$(uname -m).$(uname -s)"
rm -rf $out
pyinstaller ui/$name.py -Fwy -i fig/$name.png --distpath $out --workpath tmp/build \
    --add-data $content:content
rm -rf $name.spec
