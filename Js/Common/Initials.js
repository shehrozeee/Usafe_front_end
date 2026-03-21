
$.get('../../configuration/InitialCommonFields.json', structure => {
    structure.forEach(element => {
        $('#initialCommonFields').append(
            createInitialCommonTemplate(element));
    });

    // Auto-fill Department with site name
    let siteName = localStorage.getItem("siteName") || "";
    if (siteName && document.getElementById('Department')) {
        document.getElementById('Department').value = siteName;
    } else {
        let departments = JSON.parse(localStorage.getItem("departments") || "[]");
        if (departments.length > 0 && document.getElementById('Department')) {
            document.getElementById('Department').value = departments[0].name;
        }
    }
});

const populateNextSelect = (element) => {
    let parentName = $(element).attr("id");
    let childName = $(element).attr("data-childName");
    let elementToPopulate = $(`#${childName}`);
    let selectedValue = $(element).val();
    let api = $(element).attr("data-api");
    if (api){
        let siteId = localStorage.getItem("siteId");
        let textField = $(element).attr("data-textField");
        let valueField = $(element).attr("data-valueField");

        if(parentName == "Area"){
            api = `${api}?siteId=${siteId}&deptId=${$('#Department').val()}&areaId=${selectedValue}`;
        }
        else{
            api = `${api}?siteId=${siteId}&deptId=${selectedValue}`;
        }

        sendRequest(`${api}`,'GET',null, data => {
            elementToPopulate.empty();
            elementToPopulate.append(`<option selected disabled hidden>Select . . .</option>`);
            data.forEach(option => {
                elementToPopulate.append(`<option value="${option[valueField]}" >${option[textField]}</option>`);
            });
        })
    }
}
