namespace ThermoRawRead;

using System.Text;
using ThermoFisher.CommonCore.Data.Business;
using ThermoFisher.CommonCore.Data.FilterEnums;
using ThermoFisher.CommonCore.Data.Interfaces;
using ThermoFisher.CommonCore.RawFileReader;

public class MS
{
    public int id = -1;
    public MSOrderType ms_order;
    public string instrument_type;
    public string scan_mode = "";
    public double total_ion_current;
    public double base_peak_intensity;
    public double base_peak_mass;
    public double retention_time;

    public string description = "";
    public double injection_time;
    public double ovftt;

    public double[] masses = {};
    public double[] intensities = {};
    public double[] noises = {};

    // tandem
    public int precursor_scan = -1;
    public double activation_center;
    public double isolation_width;
    public double mz;
    public int z;

    // index
    public ulong index_mz;
    public ulong index_inten;
    public ulong index_noise;
}

public class RawData
{
    private readonly IRawDataPlus raw;
    private readonly string path_in;
    private readonly string path_out;
    private readonly (int desc, int itime, int ovftt, int pre, int width, int mz, int z) idx = (-1, -1, -1, -1, -1, -1, -1);
    public const double MASS_PROTON = 1.007276466621;

    public RawData(string path_in, string path_out)
    {
        this.path_in = path_in;
        this.path_out = path_out;
        Console.WriteLine($"loading {path_in}");
        raw = RawFileReaderAdapter.FileFactory(path_in);
        raw.SelectInstrument(Device.MS, 1);

        var headers = raw.GetTrailerExtraHeaderInformation();
        for (var i = 0; i < headers.Length; i++)
        {
            if (headers[i].Label == "Scan Description:") idx.desc = i;
            if (headers[i].Label == "Ion Injection Time (ms):") idx.itime = i;
            if (headers[i].Label == "RawOvFtT:") idx.ovftt = i;
            // tandem
            if (headers[i].Label == "Master Scan Number:") idx.pre = i;
            if (headers[i].Label == "MS2 Isolation Width:") idx.width = i;
            if (headers[i].Label == "Monoisotopic M/Z:") idx.mz = i;
            if (headers[i].Label == "Charge State:") idx.z = i;
        }
    }

    public void Run(string fmt)
    {
        var path = Path.Combine(path_out, Path.GetFileNameWithoutExtension(path_in));
        if (!Directory.Exists(path_out)) Directory.CreateDirectory(path_out);

        var buffer_meta = new StringWriter();
        buffer_meta.WriteLine($"Instrument: Thermo {raw.GetInstrumentData().Name}");
        buffer_meta.WriteLine($"Duration: {raw.RunHeader.ExpectedRuntime * 60}");

        var buffer_list = new StringWriter();

        if (fmt == "umz") RunUMZ(path, buffer_list, buffer_meta.ToString());
        else if (fmt == "msx") RunMSx(path, buffer_list);
        else Console.WriteLine($"unsupport output format: {fmt}");

        var writer_meta = new StreamWriter(path + ".txt~", false);
        writer_meta.Write(buffer_meta.ToString());
        writer_meta.Close();
        File.Delete(path + ".txt");
        File.Move(path + ".txt~", path + ".txt");
        Console.WriteLine($"file meta saved as {path}.txt");

        var writer_list = new StreamWriter(path + ".csv~", false);
        writer_list.Write(buffer_list.ToString());
        writer_list.Close();
        File.Delete(path + ".csv");
        File.Move(path + ".csv~", path + ".csv");
        Console.WriteLine($"scan list saved as {path}.csv");

        raw.Dispose();
    }

    public void RunUMZ(string path, StringWriter scan_list, string head = "")
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
        writer.Write(head.ToCharArray());
        var pos_head_end = stream.Position;
        var pos_data_begin = stream.Position;
        WriteScanListHead(scan_list);
        var last_ms1 = 0;
        for (var id = raw.RunHeaderEx.FirstSpectrum; id <= raw.RunHeaderEx.LastSpectrum; ++id)
        {
            if (id % 10000 == 0) Console.WriteLine($"reading scan data ({id} / {raw.RunHeaderEx.LastSpectrum})");
            var ms = Read(id);
            if (ms.ms_order == MSOrderType.Ms) last_ms1 = id;
            else if (ms.ms_order == MSOrderType.Ms2)
                if (idx.pre < 0)
                    ms.precursor_scan = last_ms1;
            ms.index_mz = (ulong)stream.Position;
            foreach (var x in ms.masses) writer.Write(Convert.ToDouble(x));
            ms.index_inten = (ulong)stream.Position;
            foreach (var x in ms.intensities) writer.Write(Convert.ToDouble(x));
            ms.index_noise = (ulong)stream.Position;
            foreach (var x in ms.noises) writer.Write(Convert.ToDouble(x));
            WriteScanList(scan_list, ms);
        }
        scan_list.Flush();
        var pos_data_end = stream.Position;
        var pos_meta_begin = stream.Position;
        writer.Write(scan_list.ToString().ToCharArray());
        var pos_meta_end = stream.Position;
        stream.Position = pos_index;
        writer.Write(Convert.ToUInt64(pos_head_begin));
        writer.Write(Convert.ToUInt64(pos_head_end - pos_head_begin));
        writer.Write(Convert.ToUInt64(pos_meta_begin));
        writer.Write(Convert.ToUInt64(pos_meta_end - pos_meta_begin));
        writer.Write(Convert.ToUInt64(pos_data_begin));
        writer.Write(Convert.ToUInt64(pos_data_end - pos_data_begin));
        writer.Close();
        stream.Close();
        File.Delete(path + ".umz");
        File.Move(path + ".umz~", path + ".umz");
        Console.WriteLine($"scan data saved as {path}.umz");
    }

    public void RunMSx(string path, StringWriter scan_list)
    {
        var writer_ms1 = new StreamWriter(path + ".ms1~", false);
        var writer_ms2 = new StreamWriter(path + ".ms2~", false);
        WriteScanListHead(scan_list);
        var last_ms1 = 0;
        for (var id = raw.RunHeaderEx.FirstSpectrum; id <= raw.RunHeaderEx.LastSpectrum; ++id)
        {
            if (id % 10000 == 0) Console.WriteLine($"reading scan data ({id} / {raw.RunHeaderEx.LastSpectrum})");
            var ms = Read(id);
            if (ms.ms_order == MSOrderType.Ms)
            {
                last_ms1 = id;
                WriteMS1(writer_ms1, ms);
            }
            else if (ms.ms_order == MSOrderType.Ms2)
            {
                if (idx.pre < 0) ms.precursor_scan = last_ms1;
                WriteMS2(writer_ms2, ms);
            }
            WriteScanList(scan_list, ms);
        }
        scan_list.Flush();
        writer_ms1.Close();
        writer_ms2.Close();
        File.Delete(path + ".ms1");
        File.Delete(path + ".ms2");
        File.Move(path + ".ms1~", path + ".ms1");
        Console.WriteLine($"MS1 data saved as {path}.ms1");
        File.Move(path + ".ms2~", path + ".ms2");
        Console.WriteLine($"MS2 data saved as {path}.ms2");
    }

    public MS Read(int id)
    {
        var ms = new MS { id = id };

        var scan_event = raw.GetScanEventForScanNumber(id);
        ms.ms_order = scan_event.MSOrder;
        if (scan_event.MassAnalyzer == MassAnalyzerType.MassAnalyzerITMS) ms.instrument_type = "ITMS";
        if (scan_event.MassAnalyzer == MassAnalyzerType.MassAnalyzerFTMS) ms.instrument_type = "FTMS";

        var scan_stats = raw.GetScanStatsForScanNumber(id);
        ms.scan_mode = scan_stats.ScanType;
        ms.total_ion_current = scan_stats.TIC;
        ms.base_peak_intensity = scan_stats.BasePeakIntensity;
        ms.base_peak_mass = scan_stats.BasePeakMass;
        ms.retention_time = scan_stats.StartTime * 60;

        if (idx.desc >= 0) ms.description = raw.GetTrailerExtraValue(id, idx.desc).ToString() ?? string.Empty;
        if (idx.itime >= 0) ms.injection_time = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.itime));
        if (idx.ovftt >= 0) ms.ovftt = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.ovftt));

        var scan = Scan.FromFile(raw, id);
        if (!scan.HasCentroidStream) scan = Scan.ToCentroid(scan);
        if (scan.CentroidScan.Masses != null && scan.CentroidScan.Intensities != null)
        {
            ms.masses = scan.CentroidScan.Masses;
            ms.intensities = scan.CentroidScan.Intensities;
            ms.noises = scan.CentroidScan.Noises;
        }
        else
        {
            Console.WriteLine($"[WARN] fail to read centroid data from scan #{id}");
        }

        if (ms.ms_order == MSOrderType.Ms) return ms;

        if (idx.pre >= 0) ms.precursor_scan = Convert.ToInt32(raw.GetTrailerExtraValue(id, idx.pre));
        ms.activation_center = scan_event.GetMass(0);
        if (idx.width >= 0) ms.isolation_width = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.width));
        if (idx.mz >= 0) ms.mz = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.mz));
        if (ms.mz <= 0) ms.mz = ms.activation_center;
        if (idx.z >= 0) ms.z = Convert.ToInt32(raw.GetTrailerExtraValue(id, idx.z));
        if (scan_event.Polarity == PolarityType.Negative) ms.z = -ms.z;
        return ms;
    }

    public void WriteScanListHead(TextWriter io)
    {
        io.Write((
                "ScanType,ScanID,ScanMode,ScanDescription,TotalIonCurrent,BasePeakIntensity,BasePeakMass" +
                ",RetentionTime,IonInjectionTime,InstrumentType" +
                ",PrecursorScan,ActivationCenter,IsolationWidth,PrecursorMZ,PrecursorCharge,RawOvFtT" +
                ",_MassPosition,_MassLength,_IntensityPosition,_IntensityLength,_NoisePosition,_NoiseLength" +
                "\n").ToCharArray()
        );
    }

    public void WriteScanList(TextWriter io, MS ms)
    {
        if (ms.ms_order == MSOrderType.Ms)
        {
            io.Write((
                    $"MS1,{ms.id},{ms.scan_mode},{ms.description},{ms.total_ion_current:F4},{ms.base_peak_intensity:F4},{ms.base_peak_mass:F8}" +
                    $",{ms.retention_time:F4},{ms.injection_time:F4},{ms.instrument_type}" +
                    $",0,0.0,0.0,0.0,0,{ms.ovftt:F8}" +
                    $",{ms.index_mz},{ms.masses.Length * 8},{ms.index_inten},{ms.intensities.Length * 8},{ms.index_noise},{ms.noises.Length * 8}" +
                    "\n").ToCharArray()
            );
        }
        else if (ms.ms_order == MSOrderType.Ms2)
        {
            io.Write((
                    $"MS2,{ms.id},{ms.scan_mode},{ms.description},{ms.total_ion_current:F4},{ms.base_peak_intensity:F4},{ms.base_peak_mass:F8}" +
                    $",{ms.retention_time:F4},{ms.injection_time:F4},{ms.instrument_type}" +
                    $",{ms.precursor_scan},{ms.activation_center:F8},{ms.isolation_width:F4},{ms.mz:F8},{ms.z},{ms.ovftt:F8}" +
                    $",{ms.index_mz},{ms.masses.Length * 8},{ms.index_inten},{ms.intensities.Length * 8},{ms.index_noise},{ms.noises.Length * 8}" +
                    "\n").ToCharArray()
            );
        }
    }

    public void WriteMS1(StreamWriter io, MS ms)
    {
        io.Write(
            $"S\t{ms.id}\t{ms.id}\n" +
            $"I\tTotalIonCurrent\t{ms.total_ion_current:F4}\n" +
            $"I\tBasePeakIntensity\t{ms.base_peak_intensity:F4}\n" +
            $"I\tBasePeakMass\t{ms.base_peak_mass:F8}\n" +
            $"I\tScanMode\t{ms.scan_mode}\n" +
            $"I\tRetentionTime\t{ms.retention_time:F4}\n" +
            $"I\tIonInjectionTime\t{ms.injection_time:F4}\n" +
            $"I\tInstrumentType\t{ms.instrument_type}\n"
        );
        for (var i = 0; i < ms.masses.Length; i++) io.Write($"{ms.masses[i]:F8} {ms.intensities[i]:F4}\n");
    }

    public void WriteMS2(StreamWriter io, MS ms)
    {
        io.Write(
            $"S\t{ms.id}\t{ms.id}\t{ms.activation_center:F8}\n" +
            $"I\tTotalIonCurrent\t{ms.total_ion_current:F4}\n" +
            $"I\tBasePeakIntensity\t{ms.base_peak_intensity:F4}\n" +
            $"I\tBasePeakMass\t{ms.base_peak_mass:F8}\n" +
            $"I\tScanMode\t{ms.scan_mode}\n" +
            $"I\tRetentionTime\t{ms.retention_time:F4}\n" +
            $"I\tIonInjectionTime\t{ms.injection_time:F4}\n" +
            $"I\tInstrumentType\t{ms.instrument_type}\n" +
            $"I\tPrecursorScan\t{ms.precursor_scan}\n" +
            $"I\tActivationCenter\t{ms.activation_center:F8}\n" +
            $"I\tIsolationWidth\t{ms.isolation_width:F4}\n"
        );
        if (ms.z > 0) io.Write($"Z\t{ms.z}\t{ms.mz * ms.z - MASS_PROTON * (ms.z - 1):F8}\n");
        else if (ms.z == 0) io.Write($"Z\t{0}\t{0.0:F8}\n");
        else io.Write($"Z\t{-ms.z}\t{ms.mz * -ms.z + MASS_PROTON * (-ms.z - 1):F8}\n");
        for (var i = 0; i < ms.masses.Length; i++) io.Write($"{ms.masses[i]:F8} {ms.intensities[i]:F4}\n");
    }
}

internal class Program
{
    public static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        if (args.Length == 2) new RawData(args[0], args[1]).Run("umz");
        else if (args.Length == 3) new RawData(args[1], args[2]).Run(args[0]);
        else Console.WriteLine("usage: ThermoRawRead [format: umz|msx] path_input dir_output");
        return 0;
    }
}
