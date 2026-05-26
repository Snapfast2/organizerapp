try {
    var fileToImport = new File("C:/Users/Admin/Downloads/test1.mp4");
    app.beginUndoGroup("Import Test");
    var importOptions = new ImportOptions(fileToImport);
    var importedItem = app.project.importFile(importOptions);
    var f = app.project.items.addFolder("TEST_MOVE_FOLDER");
    importedItem.parentFolder = f;
    app.endUndoGroup();
} catch(e) {
    app.project.items.addFolder("ERROR TEST: " + e.toString());
}
