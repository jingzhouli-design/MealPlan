using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class MealPlanLauncher
{
    [STAThread]
    private static void Main()
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        string electron = Path.Combine(dir, "node_modules", "electron", "dist", "electron.exe");
        if (!File.Exists(electron))
        {
            MessageBox.Show(
                "Electron is not installed yet. In this folder, run: npm install",
                "MealPlan",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = electron,
            Arguments = "\"" + dir + "\"",
            WorkingDirectory = dir,
            UseShellExecute = false
        });
    }
}
