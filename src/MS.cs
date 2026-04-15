namespace ThermoRawRead;

using ThermoFisher.CommonCore.Data.FilterEnums;

public class MS
{
    public int ID = -1;
    public string ScanMode = "";
    public MSOrderType ScanType;
    public string Analyzer = "";
    public double TotalIonCurrent;
    public double BasePeakIntensity;
    public double BasePeakMass;
    public double RetentionTime;

    public string Description = "";
    public long AGCTarget;
    public double IonInjectionTime;
    public long Resolution;
    public string CollisionEnergy = "";
    public double FAIMS;
    public double OvFtT;

    // tandem
    public double ActivationCenter;
    public double IsolationWidth;
    public double IsolationOffset;
    public int PrecursorScan = -1;
    public double MZ;
    public int Z;

    // peak
    public double[] Mass = [];
    public double[] Intensity = [];
    public double[] Noise = [];

    // index
    public ulong IndexMZ;
    public ulong IndexInten;
    public ulong IndexNoise;
}
