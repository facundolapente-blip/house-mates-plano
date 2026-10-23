' Abre House Mates Plano como un programa comun, sin la ventana negra.
' Arranca "node server.mjs --abrir --oculto" en esta carpeta con la ventana escondida. El servidor abre el navegador
' y se cierra solo unos minutos despues de cerrar la ultima pestana de la app (o con "Cerrar House Mates Plano").
' Si ya estaba abierto, solo abre el navegador. Si algo falla, abrir.bat muestra los mensajes en una ventana.
' Los argumentos que reciba se pasan al servidor (por ejemplo --puerto=5193 o --red).
' Este archivo es solo ASCII a proposito: los acentos de los mensajes van con ChrW (ver T()).
Option Explicit

Const TITULO = "House Mates Plano"
Dim sh, fso, carpeta, servidor, nodo, comando, extra, puerto, i, arg

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
servidor = fso.BuildPath(carpeta, "server.mjs")

If Not fso.FileExists(servidor) Then
  MsgBox T("No encuentro server.mjs en la carpeta del programa:{br}" & carpeta), vbCritical, TITULO
  WScript.Quit 1
End If

nodo = BuscarNode()
If nodo = "" Then
  If MsgBox(T("Para usar House Mates Plano hace falta instalar Node.js (es gratis y se instala una sola vez).{br}{br}" & _
      "Se descarga de https://nodejs.org (eleg{i} la versi{o}n LTS). Despu{e}s volv{e} a abrir House Mates Plano.{br}{br}" & _
      "{?}Abro la p{a}gina de descarga?"), vbYesNo + vbExclamation, TITULO) = vbYes Then
    sh.Run "https://nodejs.org", 1, False
  End If
  WScript.Quit 1
End If

' Puerto: --puerto=NNNN, o la variable PUERTO, o 5178 (igual que server.mjs).
puerto = sh.ExpandEnvironmentStrings("%PUERTO%")
If puerto = "%PUERTO%" Or puerto = "" Then puerto = "5178"
extra = ""
For i = 0 To WScript.Arguments.Count - 1
  arg = WScript.Arguments(i)
  extra = extra & " " & Comillas(arg)
  If LCase(Left(arg, 9)) = "--puerto=" Then puerto = Mid(arg, 10)
Next

sh.CurrentDirectory = carpeta
comando = Comillas(nodo) & " " & Comillas(servidor) & " --abrir --oculto" & extra
sh.Run comando, 0, False

' Espera a que el servidor conteste (hasta 25 segundos). Si no arranca, avisa.
If Not Responde(puerto, 25) Then
  MsgBox T("House Mates Plano no pudo arrancar.{br}{br}" & _
    "Prob{a} con abrir.bat (en " & carpeta & "): muestra en una ventana qu{e} est{a} pasando."), vbExclamation, TITULO
  WScript.Quit 1
End If
WScript.Quit 0

' Busca node.exe en el PATH y en las carpetas donde se suele instalar.
Function BuscarNode()
  Dim rutas, r, c, candidatos
  BuscarNode = ""
  On Error Resume Next
  rutas = Split(sh.ExpandEnvironmentStrings("%PATH%"), ";")
  For Each r In rutas
    c = Trim(Replace(r, """", ""))
    If c <> "" Then
      c = fso.BuildPath(sh.ExpandEnvironmentStrings(c), "node.exe")
      If Err.Number = 0 Then
        If fso.FileExists(c) Then
          BuscarNode = c
          Exit Function
        End If
      End If
      Err.Clear
    End If
  Next
  candidatos = Array("%ProgramFiles%\nodejs\node.exe", "%ProgramW6432%\nodejs\node.exe", _
    "%ProgramFiles(x86)%\nodejs\node.exe", "%LOCALAPPDATA%\Programs\nodejs\node.exe", "%NVM_SYMLINK%\node.exe")
  For Each r In candidatos
    c = sh.ExpandEnvironmentStrings(r)
    If InStr(c, "%") = 0 Then
      If fso.FileExists(c) Then
        BuscarNode = c
        Exit Function
      End If
    End If
  Next
  On Error GoTo 0
End Function

' True si algo contesta en http://127.0.0.1:<puerto>/ antes de `segundos`. Cuenta por reloj y no por intentos:
' en Windows un intento contra un puerto cerrado tarda uno o dos segundos.
Function Responde(puerto, segundos)
  Dim http, limite, ok
  Responde = False
  limite = DateAdd("s", segundos, Now)
  Do While Now < limite
    ok = False
    On Error Resume Next
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    http.SetTimeouts 1000, 1000, 1000, 2000
    http.Open "GET", "http://127.0.0.1:" & puerto & "/", False
    http.Send
    If Err.Number = 0 Then ok = (http.Status > 0)
    Err.Clear
    On Error GoTo 0
    Set http = Nothing
    If ok Then
      Responde = True
      Exit Function
    End If
    WScript.Sleep 500
  Loop
End Function

Function Comillas(s)
  Comillas = """" & s & """"
End Function

' Textos con acentos sin depender de la codificacion del archivo: {a} = a con tilde, {br} = salto de linea, etc.
Function T(ByVal s)
  s = Replace(s, "{br}", vbCrLf)
  s = Replace(s, "{a}", ChrW(225))
  s = Replace(s, "{e}", ChrW(233))
  s = Replace(s, "{i}", ChrW(237))
  s = Replace(s, "{o}", ChrW(243))
  s = Replace(s, "{u}", ChrW(250))
  s = Replace(s, "{n~}", ChrW(241))
  s = Replace(s, "{?}", ChrW(191))
  T = s
End Function
