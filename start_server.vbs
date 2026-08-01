Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.Run chr(34) & scriptPath & "\start_server.bat" & chr(34), 0
Set WshShell = Nothing
Set fso = Nothing
