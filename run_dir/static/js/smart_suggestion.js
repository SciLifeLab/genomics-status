/* Credits to https://github.com/7PH/vue-smart-suggest where this is based on */
const DROPDOWN_MARGIN = 10;
const DROPDOWN_WIDTH = 200;


export function getInputSelectionStart(input) {
    return input.selectionStart;
}

/* input will be a texteare element */
export function getDropdownPosition(input, dropdownHeight) {
    const { top, left } = window.getCaretCoordinates(
        input,
        getInputSelectionStart(input)
    );

    // Is there place for the dropdown below the caret?
    const inputRect = input.getBoundingClientRect();
    if (
        inputRect.top + top + dropdownHeight + 2 * DROPDOWN_MARGIN <=
        window.innerHeight
    ) {
        return {
            toTop: false,
            top: top + input.offsetTop + DROPDOWN_MARGIN,
            left: left + input.offsetLeft + DROPDOWN_MARGIN,
            width: DROPDOWN_WIDTH,
            height: dropdownHeight,
        };
    }

    // If there is place for the dropdown above the caret, show it there
    if (inputRect.top + top - dropdownHeight - DROPDOWN_MARGIN > 0) {
        return {
            toTop: true,
            top: top + input.offsetTop - dropdownHeight - DROPDOWN_MARGIN,
            left: left + input.offsetLeft + DROPDOWN_MARGIN,
            width: DROPDOWN_WIDTH,
            height: dropdownHeight,
        };
    }

    return {
        toTop: true,
        top: input.offsetTop - inputRect.top + DROPDOWN_MARGIN,
        left: left + input.offsetLeft + DROPDOWN_MARGIN,
        width: DROPDOWN_WIDTH,
        height: window.innerHeight - 2 * DROPDOWN_MARGIN,
    };
}