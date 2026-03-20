const selectedLanguage = localStorage.getItem("previousLanguage");
const createInitialCommonTemplate = (element) => {
  var html = "";
  switch (element.elementTag) {
    case "input":
    case "textarea":
      html = createInputElements(element);
      break;
    case "select":
      html = createSelectElements(element);
      break;
  }
  return html;
};

const createInputElements = (element) => {
  const name =
    selectedLanguage === "ur" && element.urdu ? element.urdu : element.name;
  if (element.type == "file") {
    return createCustomCameraInput(element);
  }
  if (element.type == "readonly-text") {
    return `<div class="form-group">
      <label for="${element.name}">${name}</label>
      <input type="text" class="form-control" id="${element.name}" placeholder="${element.name}" readonly style="background:#f5f5f5;cursor:default;">
    </div>`;
  }
  return `<div class="form-group">
    <label for="${element.name}">${name}</label>
    <${element.elementTag} accept="image/*" capture="user" type="${element.type}" ${element.multiple} class="form-control" id="${element.name}" placeholder="Enter ${element.name}..." col="10" row="20" ></${element.elementTag}>
    </div>`;
};

const createCustomCameraInput = (element) => {
  return `<div class="form-group">
    <label for="${element.name}">Upload File</label>
    <input type="file" class="form-control" id="${element.name}" style="display:none;">
    <div style="display:flex; gap:12px;">
      <button type="button" class="btn-upload-file" onclick="document.getElementById('${element.name}').click()">
        <i class="fas fa-cloud-upload-alt"></i> Upload File
      </button>
      <a href="#camera" class="btn-take-photo">
        <i class="fas fa-camera"></i> Take Photo
      </a>
    </div>
    <p id="${element.name}-filename" style="font-size:12px;color:#888;margin-top:6px;"></p>
  </div>
  <p id="status"></p>
  `;
}

const createFileInput = (element) => {
  return `<div id="fileuploader-container">
    <div id="file-uploader"></div>
  </div>`;
};

const createDevExtremeFileUploader = (element) => {
  $("#file-uploader").dxFileUploader({
    selectButtonText: "Select photo",
    labelText: '',
    uploadMode: "useForm",
    name: "pictures",
    multiple: false,
    elementAttr: {
      id: "pichipichipocha"
    }
  });
};

const createSelectElements = (element) => {
  const name =
    selectedLanguage === "ur" && element.urdu ? element.urdu : element.name;
  let html = `<div class="form-group">
                <label for="${element.name}">${name}</label>
                <select class="form-control" id="${element.name}" data-api="${element.api
    }"  data-textField=${element.textField} data-valueField=${element.valueField
    } data-childName="${element.child}" ${element.type === "cascaded"
      ? `onchange="${element.populateFunction}(this)"`
      : ""
    }>
                <option selected disabled hidden>Select</option>
                `;
  if (!element.Parent) {
    let departments = JSON.parse(localStorage.getItem("departments"));
    for (let i = 0; i < departments.length; i++) {
      // const depName = selectedLanguage === 'ur' && departments.urdu ? departments.urdu : departments.name;
      html += `<option value="${departments[i].id}"> ${departments[i].name} </option>`;
    }
  } else {
    for (let i = 0; i < element.options.length; i++) {
      // const text = selectedLanguage === 'ur' && element.options[i].urText ? element.options[i].urText : element.options[i].text;
      html += `<option value="${element.options[i].val}"> ${element.options[i].text} </option>`;
    }
  }
  html += `</select>
            </div>`;
  return html;
};


//!SECTION Camera Image Capture
//#region Camera Image Capture
//create an empty image blob
var imageBlob = null;

function convertBase64ToBlob(base64) {
    base64 = imageBlob;
    var binary = atob(base64);
    var array = [];
    for (var i = 0; i < binary.length; i++) {
        array.push(binary.charCodeAt(i));
    }
    return new Blob([new Uint8Array(array)], { type: 'image/jpeg' });
}
function passBlobToInputElement(blob) {
    if (!blob) alert('No image data');
    //change status
    document.getElementById('status').innerText = blob;
    var file = new File([blob], "image.jpg", { type: 'image/jpeg' });
    // Create a FileList object containing the File object
    // Create a new file input element
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*'; // Set the accept attribute to allow only image files
    fileInput.capture = 'user'; // Set the capture attribute to indicate user-facing camera
    fileInput.multiple = true; // Allow multiple files to be selected
    fileInput.classList.add('form-control'); // Add any existing classes
    fileInput.id = 'Photo'; // Set the id attribute
    fileInput.placeholder = 'Photo'; // Set the placeholder attribute
    fileInput.style.display = 'none'; // Keep hidden like the template

    // Create a DataTransfer object and add the File object
    var dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    // Assign the DataTransfer object to the input element's files property
    Object.defineProperty(fileInput, 'files', {
        value: dataTransfer.files,
        writable: false
    });

    // Get reference to the existing file input element
    var existingFileInput = document.getElementById('Photo');

    // Replace the existing file input element with the new one
    existingFileInput.parentNode.replaceChild(fileInput, existingFileInput);
    //status
    document.getElementById('status').innerText = 'image saved in the input element';
    // Update filename display
    var filenameEl = document.getElementById('Photo-filename');
    if (filenameEl) filenameEl.innerText = 'image.jpg';
}

// Show selected filename when file input changes
document.addEventListener('change', function(e) {
    if (e.target && e.target.type === 'file' && e.target.id) {
        var filenameEl = document.getElementById(e.target.id + '-filename');
        if (filenameEl && e.target.files.length > 0) {
            filenameEl.innerText = e.target.files[0].name;
        }
    }
});

//#endregion

