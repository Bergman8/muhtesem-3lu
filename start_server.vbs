' Windows arxa fonda görünməz şəkildə işlətmək üçün VBScript
' Bu faylı "shell:startup" qovluğuna kopyalayacaqsınız

Set WshShell = CreateObject("WScript.Shell")
scriptPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptPosition)
WshShell.Run chr(34) & scriptPath & "\start_server.bat" & chr(34), 0
Set WshShell = Nothing
