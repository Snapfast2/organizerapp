var errFile = new File("C:/Users/Admin/Downloads/ae_log.txt");
errFile.open("w");
try {
    var fileToImport = new File("C:/Users/Admin/Downloads/Comp 1.mp4");
    errFile.writeln("File exists: " + fileToImport.exists);
    var importOptions = new ImportOptions(fileToImport);
    var importedItem = app.project.importFile(importOptions);
    errFile.writeln("Imported: " + (importedItem ? importedItem.name : "null"));
} catch(e) {
    errFile.writeln("Error: " + e.toString());
}
errFile.close();
