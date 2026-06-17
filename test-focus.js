const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 300, height: 300,
    transparent: true,
    frame: false,
    thickFrame: false,
    hasShadow: false,
    backgroundColor: '#00000000'
  });
  win.loadURL('data:text/html,<body style=ackground:rgba(0,255,0,0.5); border-radius: 16px;><h1>Test</h1></body>');
});
