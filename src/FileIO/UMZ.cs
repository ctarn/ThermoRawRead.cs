namespace ThermoRawRead.FileIO;

public readonly struct UMZData(
    string path,
    FileStream stream,
    BinaryWriter writer,
    long pos_index,
    long pos_head_begin,
    long pos_head_end,
    long pos_data_begin)
{
    public readonly string Path = path;
    public readonly FileStream Stream = stream;
    public readonly BinaryWriter Writer = writer;
    public readonly long PosIndex = pos_index;
    public readonly long PosHeadBegin = pos_head_begin;
    public readonly long PosHeadEnd = pos_head_end;
    public readonly long PosDataBegin = pos_data_begin;
}

public static class UMZ
{
    public static UMZData Init(string path, string buffer_meta)
    {
        var stream = File.Open(path + ".umz~", FileMode.Create);
        var writer = new BinaryWriter(stream);
        writer.Write("UMZ\0\0\0\0\0".ToCharArray());
        writer.Write(Convert.ToUInt64(0)); // version
        var pos_index = stream.Position;
        writer.Write(Convert.ToUInt64(0)); // head offset
        writer.Write(Convert.ToUInt64(0)); // head length
        writer.Write(Convert.ToUInt64(0)); // meta offset
        writer.Write(Convert.ToUInt64(0)); // meta length
        writer.Write(Convert.ToUInt64(0)); // data offset
        writer.Write(Convert.ToUInt64(0)); // data length
        var pos_head_begin = stream.Position;
        writer.Write(buffer_meta.ToCharArray());
        var pos_head_end = stream.Position;
        var pos_data_begin = stream.Position;
        return new UMZData(path, stream, writer, pos_index, pos_head_begin, pos_head_end, pos_data_begin);
    }

    public static void WritePeak(UMZData umz, MS ms)
    {
        ms.IndexMZ = (ulong)umz.Stream.Position;
        foreach (var x in ms.Mass) umz.Writer.Write(Convert.ToDouble(x));
        ms.IndexInten = (ulong)umz.Stream.Position;
        foreach (var x in ms.Intensity) umz.Writer.Write(Convert.ToDouble(x));
        ms.IndexNoise = (ulong)umz.Stream.Position;
        foreach (var x in ms.Noise) umz.Writer.Write(Convert.ToDouble(x));
    }

    public static void Close(UMZData umz, string scan_list)
    {
        var pos_data_end = umz.Stream.Position;
        var pos_meta_begin = umz.Stream.Position;
        umz.Writer.Write(scan_list.ToCharArray());
        var pos_meta_end = umz.Stream.Position;
        umz.Stream.Position = umz.PosIndex;
        umz.Writer.Write(Convert.ToUInt64(umz.PosHeadBegin));
        umz.Writer.Write(Convert.ToUInt64(umz.PosHeadEnd - umz.PosHeadBegin));
        umz.Writer.Write(Convert.ToUInt64(pos_meta_begin));
        umz.Writer.Write(Convert.ToUInt64(pos_meta_end - pos_meta_begin));
        umz.Writer.Write(Convert.ToUInt64(umz.PosDataBegin));
        umz.Writer.Write(Convert.ToUInt64(pos_data_end - umz.PosDataBegin));
        umz.Writer.Close();
        umz.Stream.Close();
        File.Delete(umz.Path + ".umz");
        File.Move(umz.Path + ".umz~", umz.Path + ".umz");
        Console.WriteLine($"scan data saved as {umz.Path}.umz");
    }
}
