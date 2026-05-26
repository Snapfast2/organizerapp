var fileToImport = new File("C:/Users/Admin/Downloads/test_ae_import_003655.mp4");
if (app.project) {
    app.beginUndoGroup("Importar desde FileOrg");
    
    var targetFolder = null;
    for (var i = 1; i <= app.project.items.length; i++) {
    var item = app.project.items[i];
    if (item instanceof FolderItem && item.name === "VIDEO") {
        targetFolder = item;
        break;
    }
    }
    
    if (!targetFolder) {
    targetFolder = app.project.items.addFolder("VIDEO");
    }
    
    var importOptions = new ImportOptions(fileToImport);
    var importedItem = app.project.importFile(importOptions);
    importedItem.parentFolder = targetFolder;
    
    app.endUndoGroup();
}
