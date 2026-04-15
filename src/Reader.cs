namespace ThermoRawRead;

using ThermoFisher.CommonCore.Data.Business;
using ThermoFisher.CommonCore.Data.FilterEnums;
using ThermoFisher.CommonCore.Data.Interfaces;
using ThermoFisher.CommonCore.RawFileReader;
using ThermoRawRead.Format;

public class Reader
{
    private readonly IRawDataPlus raw;
    private readonly string path_in;
    private readonly string path_out;
    private readonly (int desc, int agc, int ijt, int res, int ce, int cv, int ovftt, int width, int offset, int pre, int mz, int z) idx = (-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1);

    public Reader(string path_in, string path_out)
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
            if (headers[i].Label == "AGC Target:") idx.agc = i;
            if (headers[i].Label == "Ion Injection Time (ms):") idx.ijt = i;
            if (headers[i].Label == "FT Resolution:") idx.res = i;
            if (headers[i].Label == "Orbitrap Resolution:") idx.res = i;
            if (headers[i].Label == "HCD Energy:") idx.ce = i;
            if (headers[i].Label == "FAIMS CV:") idx.cv = i;
            if (headers[i].Label == "RawOvFtT:") idx.ovftt = i;
            // tandem
            if (headers[i].Label == "MS2 Isolation Width:") idx.width = i;
            if (headers[i].Label == "MS2 Isolation Offset::") idx.offset = i;
            if (headers[i].Label == "Master Scan Number:") idx.pre = i;
            if (headers[i].Label == "Monoisotopic M/Z:") idx.mz = i;
            if (headers[i].Label == "Charge State:") idx.z = i;
        }
    }

    public void Run(HashSet<string> outputs)
    {
        var path = Path.Combine(path_out, Path.GetFileNameWithoutExtension(path_in));
        if (!Directory.Exists(path_out)) Directory.CreateDirectory(path_out);

        var write_umz = outputs.Contains("umz");
        var write_ms1 = outputs.Contains("ms1");
        var write_ms2 = outputs.Contains("ms2");
        var write_txt = outputs.Contains("txt");
        var write_csv = outputs.Contains("csv");
        var write_meth = outputs.Contains("meth");

        try
        {
            var buffer_meta = MakeMeta();
            if (write_txt) TXT.Write(path, buffer_meta);
            if (write_meth) METH.Write(raw, path);
            if (write_umz || write_ms1 || write_ms2) RunPeakData(path, buffer_meta, write_umz, write_ms1, write_ms2, write_csv);
            else if (write_csv) RunCSV(path);
        }
        finally
        {
            raw.Dispose();
        }
    }

    private string MakeMeta()
    {
        var buffer_meta = new StringWriter();
        buffer_meta.WriteLine($"Instrument: Thermo {raw.GetInstrumentData().Name}");
        buffer_meta.WriteLine($"Duration: {raw.RunHeader.ExpectedRuntime * 60}");
        return buffer_meta.ToString();
    }

    private void RunPeakData(string path, string buffer_meta, bool write_umz, bool write_ms1, bool write_ms2, bool write_csv)
    {
        CSVData? csv = null;
        UMZData? umz = null;
        MSXData? msx = null;

        if (write_umz || write_csv) csv = CSV.Init(path);
        if (write_umz) umz = UMZ.Init(path, buffer_meta);
        if (write_ms1 || write_ms2) msx = MSX.Init(path, write_ms1, write_ms2);

        var last_ms1 = 0;
        for (var id = raw.RunHeaderEx.FirstSpectrum; id <= raw.RunHeaderEx.LastSpectrum; ++id)
        {
            if (id % 10000 == 0) Console.WriteLine($"reading scan data ({id} / {raw.RunHeaderEx.LastSpectrum})");

            var ms = Read(id);
            if (ms.ScanType == MSOrderType.Ms) last_ms1 = id;
            else if (ms.ScanType == MSOrderType.Ms2 && idx.pre < 0) ms.PrecursorScan = last_ms1;

            if (write_umz) UMZ.WritePeak(umz!.Value, ms);
            if (write_ms1 || write_ms2) MSX.Write(msx!.Value, ms);
            if (write_umz || write_csv) CSV.Write(csv!.Value, ms);
        }

        if (write_umz) UMZ.Close(umz!.Value, CSV.GetText(csv!.Value));
        if (write_ms1 || write_ms2) MSX.Close(msx!.Value);
        if (write_csv) CSV.Close(csv!.Value);
    }

    public void RunCSV(string path)
    {
        var csv = CSV.Init(path);
        var last_ms1 = 0;
        for (var id = raw.RunHeaderEx.FirstSpectrum; id <= raw.RunHeaderEx.LastSpectrum; ++id)
        {
            if (id % 10000 == 0) Console.WriteLine($"reading scan list ({id} / {raw.RunHeaderEx.LastSpectrum})");
            var ms = Read(id, false);
            if (ms.ScanType == MSOrderType.Ms) last_ms1 = id;
            else if (ms.ScanType == MSOrderType.Ms2 && idx.pre < 0) ms.PrecursorScan = last_ms1;
            CSV.Write(csv, ms);
        }
        CSV.Close(csv);
    }

    public MS Read(int id, bool read_peak = true)
    {
        var ms = new MS { ID = id };

        var scan_event = raw.GetScanEventForScanNumber(id);
        ms.ScanMode = scan_event.ToString();
        ms.ScanType = scan_event.MSOrder;
        ms.Analyzer = scan_event.MassAnalyzer switch
        {
            MassAnalyzerType.MassAnalyzerITMS => "ITMS",
            MassAnalyzerType.MassAnalyzerTQMS => "TQMS",
            MassAnalyzerType.MassAnalyzerSQMS => "SQMS",
            MassAnalyzerType.MassAnalyzerTOFMS => "TOFMS",
            MassAnalyzerType.MassAnalyzerFTMS => "FTMS",
            MassAnalyzerType.MassAnalyzerSector => "Sector",
            MassAnalyzerType.MassAnalyzerASTMS => "ASTMS",
            _ => ms.Analyzer,
        };

        var scan_stats = raw.GetScanStatsForScanNumber(id);
        ms.TotalIonCurrent = scan_stats.TIC;
        ms.BasePeakIntensity = scan_stats.BasePeakIntensity;
        ms.BasePeakMass = scan_stats.BasePeakMass;
        ms.RetentionTime = scan_stats.StartTime * 60;

        if (idx.desc >= 0) ms.Description = raw.GetTrailerExtraValue(id, idx.desc).ToString() ?? "";
        if (idx.agc >= 0) ms.AGCTarget = Convert.ToInt64(raw.GetTrailerExtraValue(id, idx.agc));
        if (idx.ijt >= 0) ms.IonInjectionTime = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.ijt));
        if (idx.res >= 0) ms.Resolution = Convert.ToInt64(raw.GetTrailerExtraValue(id, idx.res));
        if (idx.ce >= 0) ms.CollisionEnergy = raw.GetTrailerExtraValue(id, idx.ce).ToString() ?? "";
        if (idx.cv >= 0) ms.FAIMS = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.cv));
        if (idx.ovftt >= 0) ms.OvFtT = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.ovftt));

        if (ms.ScanType != MSOrderType.Ms)
        {
            ms.ActivationCenter = scan_event.GetMass(0);
            if (idx.width >= 0) ms.IsolationWidth = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.width));
            if (idx.offset >= 0) ms.IsolationOffset = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.offset));
            if (idx.pre >= 0) ms.PrecursorScan = Convert.ToInt32(raw.GetTrailerExtraValue(id, idx.pre));
            if (idx.mz >= 0) ms.MZ = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.mz));
            if (ms.MZ <= 0) ms.MZ = ms.ActivationCenter;
            if (idx.z >= 0) ms.Z = Convert.ToInt32(raw.GetTrailerExtraValue(id, idx.z));
            if (scan_event.Polarity == PolarityType.Negative) ms.Z = -ms.Z;
        }

        if (!read_peak) return ms;

        var scan = Scan.FromFile(raw, id);
        if (!scan.HasCentroidStream) scan = Scan.ToCentroid(scan);
        if (scan.CentroidScan.Masses != null && scan.CentroidScan.Intensities != null)
        {
            ms.Mass = scan.CentroidScan.Masses;
            ms.Intensity = scan.CentroidScan.Intensities;
            ms.Noise = scan.CentroidScan.Noises;
        }
        else
        {
            Console.WriteLine($"[WARN] fail to read centroid data from scan #{id}");
        }

        return ms;
    }
}
