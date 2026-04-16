namespace ThermoRawRead.Format;

using ThermoFisher.CommonCore.Data.FilterEnums;

public readonly struct CSVData(string path, StringWriter writer)
{
    public readonly string Path = path;
    public readonly StringWriter Writer = writer;
}

public static class CSV
{
    public static CSVData Init(string path)
    {
        var writer = new StringWriter();
        writer.Write((
                "ScanID::Int,ScanMode::String,ScanType::String,Analyzer::String" +
                ",TotalIonCurrent::Float,BasePeakIntensity::Float,BasePeakMass::Float,RetentionTime::Float" +
                ",Description::String,AGCTarget::Int,IonInjectionTime::Float,Resolution::Int,CollisionEnergy::String,FAIMS::Float,RawOvFtT::Float" +
                ",ActivationCenter::Float,IsolationWidth::Float,IsolationOffset::Float,PrecursorScan::Int,PrecursorMZ::Float,PrecursorCharge::Int" +
                ",_MassPosition::UInt,_MassLength::UInt,_IntensityPosition::UInt,_IntensityLength::UInt,_NoisePosition::UInt,_NoiseLength::UInt" +
                "\n").ToCharArray()
        );
        return new CSVData(path, writer);
    }

    public static void Write(CSVData csv, MS ms)
    {
        var scan_type = ms.ScanType switch
        {
            MSOrderType.Ms => "MS1",
            MSOrderType.Ms2 => "MS2",
            _ => "",
        };
        csv.Writer.Write((
                $"{ms.ID},\"{ms.ScanMode}\",{scan_type},{ms.Analyzer}" +
                $",{ms.TotalIonCurrent:F4},{ms.BasePeakIntensity:F4},{ms.BasePeakMass:F8},{ms.RetentionTime:F4}" +
                $",\"{ms.Description}\",{ms.AGCTarget},{ms.IonInjectionTime:F4},{ms.Resolution},\"{ms.CollisionEnergy}\",{ms.FAIMS:F4},{ms.OvFtT:F8}" +
                $",{ms.ActivationCenter:F8},{ms.IsolationWidth:F4},{ms.IsolationOffset:F4},{ms.PrecursorScan},{ms.MZ:F8},{ms.Z}" +
                $",{ms.IndexMZ},{ms.Mass.Length * 8},{ms.IndexInten},{ms.Intensity.Length * 8},{ms.IndexNoise},{ms.Noise.Length * 8}" +
                "\n").ToCharArray()
        );
    }

    public static string GetText(CSVData csv) { return csv.Writer.ToString(); }

    public static void Close(CSVData csv)
    {
        var writer_list = new StreamWriter(csv.Path + ".csv~", false);
        writer_list.Write(csv.Writer.ToString());
        writer_list.Close();
        File.Delete(csv.Path + ".csv");
        File.Move(csv.Path + ".csv~", csv.Path + ".csv");
        Console.WriteLine($"scan list saved as {csv.Path}.csv");
    }
}
