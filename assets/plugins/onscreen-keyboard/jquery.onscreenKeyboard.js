(function($){
$.fn.onscreenKeyboard = function(options){

    var settings = $.extend({
        type: 'qwerty', // this can be either 'qwerty' or 'numeric'
        caps: true, // start the keyboard in caps mode
        allowTypingClass: 'onscreenKeyboardTarget' // add this class to elements which can be typed in
   }, options);

    var target = $(this);
    
    // construct keyboard
    
        if ( settings.type ==  'qwerty' ) {
            
            var keys = [
                ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'delete'],
                ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
                ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
                ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'shift']
            ];
            
            var keyboard = $('<div></div>');
            $.each(keys, function(rowIndex, rowKeys){
                var row = $('<div class="keyRow"></div>');
                $.each(rowKeys, function(keyIndex, key){
                    $(row).append('<div class="key '+key+'-key" data-character="'+key+'">'+key+'</div>');
                });
                $(keyboard).append(row);
            });
            
            $(keyboard).append('<div class="keyRow"><div class="key space-key" data-character="space"><span>space</span></div></div>');
            
            console.log(keyboard);
            
        } else if ( settings.type == 'numeric' ) {
            
            // TODO
            
        }
        
    // append keyboard
        
        $(target).append(keyboard);
        
        if ( settings.caps == true ) {
            $(target).addClass('caps');
        }
        
    // key controls
    
        $(target).mousedown(function(e){
            e.preventDefault();
        });
    
        $('.key').mousedown(function(e){
            
            e.preventDefault();
            var char = $(this).attr('data-character');
            var input = $('.'+settings.allowTypingClass+':focus');
            var caret = $(input).caret();
            var value = $(input).val();
            
            var type = null;
            
            if ( char == 'space' ) {
                var type = ' ';
            } else if ( char == 'delete' ) {
                var newValue = value.charAt(caret) + value.substr(0, (caret - 1)) + value.substr(caret + 1);
                $(input).val(newValue);
                $(input).caret(caret-1);
            } else if ( char == 'shift' ) {
                $(target).toggleClass('caps');
            } else {
                
                if ( $(target).hasClass('caps') ) {
                    var char = char.toUpperCase();
                }
                
                var type = char;
                
                $(target).removeClass('caps');
                
            }
            
            if ( type != null ) {
                var newValue = [value.slice(0, caret), type, value.slice(caret)].join('');
                $(input).val(newValue);
                $(input).caret(caret+1);
            }
            
        });
    
};
})(jQuery);
