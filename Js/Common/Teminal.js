// $.get('../../configuration/TerminalCommonFields.json', structure => {
//     //iterate through the structure and call the function to create the template
//     structure.forEach(element => {
//         $('#terminalCommonFields').append(createTerminalCommonTemplate(element));
//     });
// });
$.get('../../configuration/TerminalCommonFields.json', structure => {
    // Same DOM-ready guard as Initials.js — this runs in <head>, the container is
    // in <body>, and a cached response can resolve before the body is parsed.
    $(function () {
        //iterate through the structure and call the function to create the template
        structure.forEach(element => {
            $('#terminalCommonFields').append(createTerminalCommonTemplate(element));
        });
    });
});
