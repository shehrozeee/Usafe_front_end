//if document title contains environmental then set the IsEnvironmetal flag in local storage to true else false
if (document.title.includes("Environmental")) {
    localStorage.setItem("IsEnvironmental", true);
    $.get('../configuration/environmentalReporting.json', structure => {
        //iterate through the structure and call the function to create the template
        structure.forEach(element => {
           $('#reportingTypes').append(createReportingTypeTemplate(element.heading, element.href,element.urdu,element.description));
        });
    })
    
} else {
    localStorage.setItem("IsEnvironmental", false);
    $.get('../configuration/ReportingTypes.json', structure => {
        //iterate through the structure and call the function to create the template
        structure.forEach(element => {
            $('#reportingTypes').append(createReportingTypeTemplate(element.heading, element.href,element.urdu,element.description));
        });
    })
}