namespace ThermoRawRead;

using ThermoFisher.CommonCore.Data.Business;
using ThermoFisher.CommonCore.Data.FilterEnums;
using ThermoFisher.CommonCore.Data.Interfaces;
using ThermoFisher.CommonCore.RawFileReader;
using ThermoRawRead.FileIO;

public class Reader
{
    private readonly IRawDataPlus raw;
    private readonly string path_in;
    private readonly string path_out;
    private readonly TrailerExtraHeaderIndex idx;

    private struct TrailerExtraHeaderIndex()
    {
        public int Description = -1;
        public int AGC = -1;
        public int IonInjectionTime = -1;
        public int Resolution = -1;
        public int CollisionEnergy = -1;
        public int FAIMS = -1;
        public int OvFtT = -1;
        public int TandemWidth = -1;
        public int TandemOffset = -1;
        public int PrecursorScan = -1;
        public int PrecursorMZ = -1;
        public int PrecursorZ = -1;
    }

    private TrailerExtraHeaderIndex InitTrailerExtraHeaderIndex()
    {
        var idx = new TrailerExtraHeaderIndex();
        var headers = raw.GetTrailerExtraHeaderInformation();
        for (var i = 0; i < headers.Length; i++)
        {
            if (headers[i].Label == "Scan Description:") idx.Description = i;
            if (headers[i].Label == "AGC Target:") idx.AGC = i;
            if (headers[i].Label == "Ion Injection Time (ms):") idx.IonInjectionTime = i;
            if (headers[i].Label == "FT Resolution:") idx.Resolution = i;
            if (headers[i].Label == "Orbitrap Resolution:") idx.Resolution = i;
            if (headers[i].Label == "HCD Energy:") idx.CollisionEnergy = i;
            if (headers[i].Label == "FAIMS CV:") idx.FAIMS = i;
            if (headers[i].Label == "RawOvFtT:") idx.OvFtT = i;
            // tandem
            if (headers[i].Label == "MS2 Isolation Width:") idx.TandemWidth = i;
            if (headers[i].Label == "MS2 Isolation Offset::") idx.TandemOffset = i;
            if (headers[i].Label == "Master Scan Number:") idx.PrecursorScan = i;
            if (headers[i].Label == "Monoisotopic M/Z:") idx.PrecursorMZ = i;
            if (headers[i].Label == "Charge State:") idx.PrecursorZ = i;
        }
        return idx;
    }

    public Reader(string path_in, string path_out)
    {
        this.path_in = path_in;
        this.path_out = path_out;
        Console.WriteLine($"loading {path_in}");
        raw = RawFileReaderAdapter.FileFactory(path_in);
        raw.SelectInstrument(Device.MS, 1);
        idx = InitTrailerExtraHeaderIndex();
    }

    public void Run(HashSet<string> formats)
    {
        var path = Path.Combine(path_out, Path.GetFileNameWithoutExtension(path_in));
        if (!Directory.Exists(path_out)) Directory.CreateDirectory(path_out);

        var write_umz = formats.Contains("umz");
        var write_ms1 = formats.Contains("ms1");
        var write_ms2 = formats.Contains("ms2");
        var write_txt = formats.Contains("txt");
        var write_csv = formats.Contains("csv");
        var write_meth = formats.Contains("meth");

        try
        {
            var buffer_meta = MakeMeta();
            if (write_txt) TXT.Write(path, buffer_meta);
            if (write_meth) METH.Write(raw, path);
            if (write_umz || write_ms1 || write_ms2)
                RunPeakData(path, buffer_meta, write_umz, write_ms1, write_ms2, write_csv);
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

    private void RunPeakData(string path, string buffer_meta, bool write_umz, bool write_ms1, bool write_ms2,
        bool write_csv)
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
            else if (ms.ScanType == MSOrderType.Ms2 && idx.PrecursorScan < 0) ms.PrecursorScan = last_ms1;

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
            else if (ms.ScanType == MSOrderType.Ms2 && idx.PrecursorScan < 0) ms.PrecursorScan = last_ms1;
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

        if (idx.Description >= 0) ms.Description = raw.GetTrailerExtraValue(id, idx.Description).ToString() ?? "";
        if (idx.AGC >= 0) ms.AGCTarget = Convert.ToInt64(raw.GetTrailerExtraValue(id, idx.AGC));
        if (idx.IonInjectionTime >= 0)
            ms.IonInjectionTime = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.IonInjectionTime));
        if (idx.Resolution >= 0) ms.Resolution = Convert.ToInt64(raw.GetTrailerExtraValue(id, idx.Resolution));
        if (idx.CollisionEnergy >= 0)
            ms.CollisionEnergy = raw.GetTrailerExtraValue(id, idx.CollisionEnergy).ToString() ?? "";
        if (idx.FAIMS >= 0) ms.FAIMS = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.FAIMS));
        if (idx.OvFtT >= 0) ms.OvFtT = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.OvFtT));

        if (ms.ScanType != MSOrderType.Ms)
        {
            ms.ActivationCenter = scan_event.GetMass(0);
            if (idx.TandemWidth >= 0)
                ms.IsolationWidth = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.TandemWidth));
            if (idx.TandemOffset >= 0)
                ms.IsolationOffset = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.TandemOffset));
            if (idx.PrecursorScan >= 0)
                ms.PrecursorScan = Convert.ToInt32(raw.GetTrailerExtraValue(id, idx.PrecursorScan));
            if (idx.PrecursorMZ >= 0) ms.MZ = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.PrecursorMZ));
            if (ms.MZ <= 0) ms.MZ = ms.ActivationCenter;
            if (idx.PrecursorZ >= 0) ms.Z = Convert.ToInt32(raw.GetTrailerExtraValue(id, idx.PrecursorZ));
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
            Console.WriteLine($"[WARN] scan #{id}: fail to read centroid data");
        }

        return ms;
    }
}
