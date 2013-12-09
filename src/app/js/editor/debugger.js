if (typeof yasp == 'undefined') yasp = { };

(function() {
  var updateInterval;
  var debuggerEditor;
  var hw_led_green, hw_led_yellow, hw_led_red;
  var hw_but_black, hw_but_red;
  
  var hardware = [ ];
  
  $('body').ready(function() {
    debuggerEditor = yasp.EditorManager.create($('#debugger_editor').get(0));
    debuggerEditor.swapDoc(yasp.EditorManager.editors[0].linkedDoc({
      sharedHist: true
    }));
    debuggerEditor.setOption('readOnly', "nocursor");

    breadboard = new yasp.BreadBoard($('#hardwarecontainer'), yasp.EmulatorCommunicator, yasp.BreadBoardTypes.usbmaster);
    breadboard.build();
  });
  
  
  yasp.Debugger = {
    show: function() {
      $('#dialog_debugger').modal({
        'keyboard': true
      }).on('shown.bs.modal', function() {
        // redraw hardware
        breadboard.render();
        
        // load code into emulator
        yasp.EmulatorCommunicator.sendMessage("LOAD", {
          bitcode: yasp.Editor.bitcode,
          start: 0
        }, function() {
          yasp.EmulatorCommunicator.sendMessage("CONTINUE", {
            count: null
          });
        });
        
      }).on('hidden.bs.modal', function() {
        // stop execution
        yasp.EmulatorCommunicator.sendMessage("BREAK", { });
      });
      
      var updateFunc;
      updateInterval || (updateInterval = setInterval(updateFunc = function() {
        var height = $('#dialog_debugger .modal-content').height();
        $('#debugger_table').css({
          "height": (height-200)+"px"
        });

        debuggerEditor.refresh();
      }, 250)); // weird hack for CodeMirror & size adjustment
      
      setTimeout(updateFunc, 10);
    }
  };
})();

