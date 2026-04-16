namespace ThermoRawRead.Format;

using ThermoFisher.CommonCore.Data.FilterEnums;

public readonly struct MSXData(string path, StreamWriter? writer_ms1, StreamWriter? writer_ms2)
{
    public readonly string Path = path;
    public readonly StreamWriter? WriterMS1 = writer_ms1;
    public readonly StreamWriter? WriterMS2 = writer_ms2;
}

public static class MSX
{
    private const double MassProton = 1.007276466621;

    public static MSXData Init(string path, bool write_ms1, bool write_ms2)
    {
        var writer_ms1 = write_ms1 ? new StreamWriter(path + ".ms1~", false) : null;
        var writer_ms2 = write_ms2 ? new StreamWriter(path + ".ms2~", false) : null;
        return new MSXData(path, writer_ms1, writer_ms2);
    }

    public static void Write(MSXData msx, MS ms)
    {
        switch (ms.ScanType)
        {
            case MSOrderType.Ms when msx.WriterMS1 != null: WriteMS1(msx.WriterMS1, ms); break;
            case MSOrderType.Ms2 when msx.WriterMS2 != null: WriteMS2(msx.WriterMS2, ms); break;
            default: Console.WriteLine($"[WARN] scan #{ms.ID}: not supported type {ms.ScanType}"); break;
        }
    }

    public static void Close(MSXData msx)
    {
        if (msx.WriterMS1 != null)
        {
            msx.WriterMS1.Close();
            File.Delete(msx.Path + ".ms1");
            File.Move(msx.Path + ".ms1~", msx.Path + ".ms1");
            Console.WriteLine($"MS1 data saved as {msx.Path}.ms1");
        }
        if (msx.WriterMS2 != null)
        {
            msx.WriterMS2.Close();
            File.Delete(msx.Path + ".ms2");
            File.Move(msx.Path + ".ms2~", msx.Path + ".ms2");
            Console.WriteLine($"MS2 data saved as {msx.Path}.ms2");
        }
    }

    private static void WriteMS1(StreamWriter io, MS ms)
    {
        io.Write(
            $"S\t{ms.ID}\t{ms.ID}\n" +
            $"I\tScanMode\t{ms.ScanMode}\n" +
            $"I\tInstrumentType\t{ms.Analyzer}\n" +
            $"I\tTotalIonCurrent\t{ms.TotalIonCurrent:F4}\n" +
            $"I\tBasePeakIntensity\t{ms.BasePeakIntensity:F4}\n" +
            $"I\tBasePeakMass\t{ms.BasePeakMass:F8}\n" +
            $"I\tRetentionTime\t{ms.RetentionTime:F4}\n" +
            $"I\tIonInjectionTime\t{ms.IonInjectionTime:F4}\n"
        );
        for (var i = 0; i < ms.Mass.Length; i++) io.Write($"{ms.Mass[i]:F8} {ms.Intensity[i]:F4}\n");
    }

    private static void WriteMS2(StreamWriter io, MS ms)
    {
        io.Write(
            $"S\t{ms.ID}\t{ms.ID}\t{ms.ActivationCenter:F8}\n" +
            $"I\tScanMode\t{ms.ScanMode}\n" +
            $"I\tInstrumentType\t{ms.Analyzer}\n" +
            $"I\tTotalIonCurrent\t{ms.TotalIonCurrent:F4}\n" +
            $"I\tBasePeakIntensity\t{ms.BasePeakIntensity:F4}\n" +
            $"I\tBasePeakMass\t{ms.BasePeakMass:F8}\n" +
            $"I\tRetentionTime\t{ms.RetentionTime:F4}\n" +
            $"I\tIonInjectionTime\t{ms.IonInjectionTime:F4}\n" +
            $"I\tActivationCenter\t{ms.ActivationCenter:F8}\n" +
            $"I\tIsolationWidth\t{ms.IsolationWidth:F4}\n" +
            $"I\tPrecursorScan\t{ms.PrecursorScan}\n"
        );
        switch (ms.Z)
        {
            case > 0: io.Write($"Z\t{ms.Z}\t{ms.MZ * ms.Z - MassProton * (ms.Z - 1):F8}\n"); break;
            case < 0: io.Write($"Z\t{-ms.Z}\t{ms.MZ * -ms.Z + MassProton * (-ms.Z - 1):F8}\n"); break;
            default: io.Write($"Z\t{0}\t{0.0:F8}\n"); break;
        }
        for (var i = 0; i < ms.Mass.Length; i++) io.Write($"{ms.Mass[i]:F8} {ms.Intensity[i]:F4}\n");
    }
}
