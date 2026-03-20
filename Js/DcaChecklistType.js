
let sectionFor = getValue('sectionFor');
console.log('DcaChecklistType: loading types for:', sectionFor);
sendRequest(`api/checklist/getdcaChecklisttypes?checkListFormName=${sectionFor}`, "GET", null, result => {
    console.log('DcaChecklistType: API result:', JSON.stringify(result));
    if (result && result.sectionHeading && result.sectionHeading.length) {
        result.sectionHeading.forEach(element => {
            $('#dcaChecklistType').append(createReportingTypeTemplate(element.heading, element.href));
        });
    } else {
        console.error('DcaChecklistType: No sections found in result', result);
        $('#dcaChecklistType').html('<p class="text-center text-muted mt-5">No checklists found.</p>');
    }
});