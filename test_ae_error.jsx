try {
    var fileToImport = new File("C:/Users/Admin/Downloads/test_ae_import_003655.mp4");
    var logFile = new File("C:/Users/Admin/.gemini/antigravity/scratch/file-organizer/ae_log.txt");
    logFile.open("w");
    logFile.writeln("Starting script");
    
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
        logFile.writeln("Found or creating folder");
        if (!targetFolder) {
            targetFolder = app.project.items.addFolder("VIDEO");
        }
        
        var importOptions = new ImportOptions(fileToImport);
        logFile.writeln("Created importOptions");
        var importedItem = app.project.importFile(importOptions);
        logFile.writeln("Imported item: " + (importedItem ? importedItem.name : "null"));
        importedItem.parentFolder = targetFolder;
        
        app.endUndoGroup();
        logFile.writeln("Success");
    } else {
        logFile.writeln("No app.project");
    }
    logFile.close();
} catch (e) {
    var errFile = new File("C:/Users/Admin/.gemini/antigravity/scratch/file-organizer/ae_log.txt");
    errFile.open("a");
    errFile.writeln("Error: " + e.message + " on line " + e.line);
    errFile.close();
}
