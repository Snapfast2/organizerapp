var fileToImport = new File("C:/Users/Admin/Downloads/test_download_watcher_232116.mp4");
if (app.project) {
    app.project.importFile(new ImportOptions(fileToImport));
}
