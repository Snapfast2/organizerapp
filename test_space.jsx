try {
    var fileToImport = new File("C:/Users/Admin/Downloads/Comp 1.mp4");
    alert("Exists? " + fileToImport.exists);
} catch(e) {
    alert("Error: " + e.toString());
}
