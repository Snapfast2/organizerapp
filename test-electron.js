const { app, BrowserWindow } = require('electron');

// Force software rendering so Parsec can capture the window
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer', 'false');
app.disableHardwareAcceleration();

app.whenReady().then(() => {
  const win = new BrowserWindow({ 
    width: 800, height: 600, 
    x: 100, y: 100,
    show: true, 
    frame: true,
    alwaysOnTop: true,
    backgroundColor: '#ff0000'
  });
  win.loadURL('data:text/html,<body style="background:red;margin:0"><h1 style="color:white;font-size:60px;padding:50px">MOOMOTION TEST OK!</h1></body>');
  console.log('Window shown with software rendering');
});
