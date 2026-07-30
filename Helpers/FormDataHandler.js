function getFormValues(formId, url, obj) {
  //disable the submit button
  $(obj).attr("disabled", true);
  var form = document.getElementById(formId);
  var elements = form.elements;
  let formName = localStorage.getItem("sectionFor");
  let reportedBy = localStorage.getItem("userName");
  let IsEnvironmental = localStorage.getItem("IsEnvironmental");
  let siteId = localStorage.getItem("siteId");
  var values = { formName };
  values["userName"] = reportedBy;
  values["IsEnvironmental"] = IsEnvironmental;
  values["siteId"] = siteId;

  let containFiles = false;
  let dataTime = "";
  for (var i = 0; i < elements.length; i++) {
    var element = elements[i];
    var fieldName = element.id || element.name;
    var fieldType = element.type;

    if (
      fieldName &&
      fieldType !== "submit" &&
      fieldType !== "reset" &&
      fieldType !== "button"
    ) {
      if (element.value.includes("Select") || element.value === "" && fieldType !== "file") {
        swalNotification("Please select a value for " + element.id, "warning");
        //border color change to red
        element.style.borderColor = "red";
        $(obj).attr("disabled", false);

        return;
      }
      if (fieldType === "checkbox") {
        values[fieldName] = element.checked;
      } else if (fieldType === "file") {
        containFiles = true;
      } else if (fieldType === "date" || fieldType === "time") {
        dataTime += element.value + " ";
      } else if (element.multiple) {
        values[fieldName] = getMultipleSelectValues(element);
      } else if (fieldType === "radio") {
        values[fieldName] = $(`input[name="${fieldName}"]:checked`).val();
      } else {
        values[fieldName] = element.value;
      }
    }
  }
  if (dataTime) {
    values["Date"] = new Date(dataTime);
  }

  if (containFiles) {
    var fileElements = Array.from(form.getElementsByTagName("input")).filter(
      function (element) {
        return element.type === "file";
      }
    );

    let picturesFormData = getFileValues(fileElements);
    picturesFormData.append("values", JSON.stringify(values));

    values = picturesFormData;
  }
  if (url && values) {
    sendRequestWithFiles(url, "POST", values);
  }
  console.log(values);
  //prevent form from submitting

  return false;
}
function getFileValues(fileElements) {
  var formData = new FormData();

  // Accept a single element (legacy callers) or an array of file inputs.
  if (!Array.isArray(fileElements)) fileElements = [fileElements];

  fileElements.forEach(function (fileElement) {
    // Field name defaults to "pictures" (unchanged for existing forms). Inputs that
    // set data-imgfield (e.g. the incident Where/How/Why slots) submit under that name
    // so the backend can record each photo's category.
    var field =
      (fileElement.dataset && fileElement.dataset.imgfield) || "pictures";
    for (var i = 0; i < fileElement.files.length; i++) {
      formData.append(field, fileElement.files[i]);
    }
  });

  return formData;
}

function getMultipleSelectValues(selectElement) {
  var selectedOptions = Array.from(selectElement.selectedOptions).map(function (
    option
  ) {
    return option.value;
  });

  return selectedOptions;
}

function validateForm(element, obj) {
  if (element.value.includes("Select") || element.value === "") {
    swalNotification("Please select a value for " + element.id, "warning");
    //border color change to red
    element.style.borderColor = "red";
    $(obj).attr("disabled", false);

    return;
  }
}