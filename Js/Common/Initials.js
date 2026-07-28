
$.get('../../configuration/InitialCommonFields.json', structure => {
    // This script runs in <head> but #initialCommonFields is in <body>. On a warm
    // cache the fetch can resolve before the body is parsed, and the append would
    // silently target nothing — leaving the form with no fields at all. $(fn) runs
    // immediately when the DOM is already ready, otherwise waits for it.
    $(function () {
        structure.forEach(element => {
            $('#initialCommonFields').append(
                createInitialCommonTemplate(element));
        });

        // Department is the agency: a dropdown for multi-site users, otherwise the
        // single site name in the readonly field.
        let departmentField = document.getElementById('Department');
        if (departmentField && !renderSiteSelect(departmentField)) {
            let siteName = getActiveSiteName();
            if (siteName) {
                departmentField.value = siteName;
            } else {
                let departments = JSON.parse(localStorage.getItem("departments") || "[]");
                if (departments.length > 0) {
                    departmentField.value = departments[0].name;
                }
            }
        }
    });
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
