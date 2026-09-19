Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\projects\cloud-torrent-gdrive"
WshShell.Run """C:\nvm4w\nodejs\node.exe"" ""C:\projects\cloud-torrent-gdrive\supervisor.js""", 0, True
