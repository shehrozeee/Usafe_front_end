const username = document.getElementById('username');
const password = document.getElementById('password');
const action = document.getElementById('Action');
const languageSelect = document.getElementById('languageSelect');
const englishElements = document.querySelectorAll('.english-text');
const urduElements = document.querySelectorAll('.urdu-text');
// const selectElement = document.getElementById("ActTyp");
const selectElements = document.querySelectorAll(".dust");

if (languageSelect) {

function changePlaceholder() {
    const selectedLanguage = languageSelect.value;
    localStorage.setItem('previousLanguage', selectedLanguage);

  switch (selectedLanguage) {
    case 'en':
        englishElements.forEach(el => {
            el.style.display = 'inline'
        });
        urduElements.forEach(ur => {
            ur.style.display = 'none'
        })
        username.placeholder = 'Email';
        password.placeholder = 'Password';

        break;
        case 'ur':
            englishElements.forEach(el => {
                el.style.display = 'none'
            });
            urduElements.forEach(ur => {
                ur.style.display = 'inline'
            })
            username.placeholder = 'ای میل';
            password.placeholder = 'پاس ورڈ';

        break;
    }
}

} else {

    const selectedLanguage = localStorage.getItem('previousLanguage');
    switch (selectedLanguage) {
        case 'en':
            englishElements.forEach(el => {
                el.style.display = 'inline'
            });

            urduElements.forEach(ur => {
                ur.style.display = 'none'
            });

            if (action) action.placeholder = 'Action'
            if (selectedLanguage) {
                for (const selectElement of selectElements) {
                    for (const option of selectElement.options) {
                        if (option.getAttribute('lang') === selectedLanguage) {
                            option.selected = true;
                            break;
                        }
                    }
                }
            }
            break;
        case 'ur':
                englishElements.forEach(el => {
                    el.style.display = 'none'
                });

                urduElements.forEach(ur => {
                    ur.style.display = 'inline'
                });
                action.placeholder = 'عمل'

                if (selectedLanguage) {
                    for (const selectElement of selectElements) {
                        for (const option of selectElement.options) {
                            if (option.getAttribute('lang') === selectedLanguage) {
                                option.selected = true;
                                break;
                            }
                        }
                    }
                }
                break;
            }

        }


function loadSelectedLanguage() {
    const selectedLanguage = localStorage.getItem('previousLanguage');
    if (selectedLanguage) {
        const langSelect = document.getElementById('languageSelect');
        if (langSelect) langSelect.value = selectedLanguage;
    }
    if (typeof changePlaceholder === 'function') changePlaceholder();
}
loadSelectedLanguage(); // Call the function to load the previously selected language on page load

