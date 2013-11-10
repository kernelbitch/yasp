if (typeof yasp == 'undefined') yasp = { };

(function() {
  var tickTimeout = 1000;
  var debug = false;

  /**
   * Emulator is responsible for running the bytecode from the assembler
   * @constructor
   */
  yasp.Emulator = function() {
    this.rom = new Uint8Array(512);
    this.ram = new Uint8Array(512);

    this.pc = 0;
    this.running = false;
    this.stepping = false;
    this.flags = { c: false, z: false };

    this.commandCache = {};

    setTimeout(this.tick.bind(this), tickTimeout);
  };

  /**
   * @function Loads the given bitcode into the ROM
   * @param bitcode bitcode to load
   * @param start address to start loading into
   * @returns {Number|Boolean}
   */
  yasp.Emulator.prototype.load = function(bitcode, start) {
    if(start < 0 || start >= this.rom.length)
      return 0;
    if(!(bitcode instanceof Uint8Array))
      return 2;
    if(start + bitcode.length >= this.rom.length)
      return 1;

    this.rom.set(bitcode, start);
    this.commandCache = {};
    return true;
  };

  /**
   * @function Continues the execution
   * @param count number of instructions to execute or null
   * @returns {Number|Boolean}
   */
  yasp.Emulator.prototype.continue = function (count) {
    if(count == null) {
      this.running = true;
    }
    else if(typeof count == "number") {
      if(count < 0)
        return 0;
      this.running = +count;
    }
    else {
      return 2;
    }

    return true;
  };

  /**
   * @function Stops the execution
   * @returns {Number|Boolean}
   */
  yasp.Emulator.prototype.break = function () {
    if(this.running == false) {
      return 0;
    }

    this.running = false;

    return true;
  };

  /**
   * @function Writes the given value into the given byte register
   * @param r the byte-register to write to
   * @param v the value to write
   * @returns {Number|Boolean}
   */
  yasp.Emulator.prototype.writeByteRegister = function (r, v) {
    if(r < 0 || r > 32)
      return 0;
    if(v < 0 || v > 255)
      return 1;
    this.ram[r] = v;
    if(debug) console.log("b" + r + "=" + v);
    return true;
  };

  /**
   * @function Reads the given value at the given byte
   * @param r the byte-register to read
   * @returns {Number}
   */
  yasp.Emulator.prototype.readByteRegister = function (r) {
    if(r < 0 || r > 32)
      return -1;
    return this.ram[r];
  };

  /**
   * @function Writes the given value into the given word register
   * @param r the word-register to write to
   * @param v the value to write
   * @returns {Number|Boolean}
   */
  yasp.Emulator.prototype.writeWordRegister = function (r, v) {
    if(r < 0 || r > 32)
      return 0;
    if(v < 0 || v > 65535)
      return 1;

    var bytes = yasp.bitutils.bytesFromWord(v);

    if(debug) console.log("b" + r + "=" + v);
    r = r * 2;
    this.ram[r] = bytes[0];
    this.ram[r + 1] = bytes[1];

    return true;
  };

  /**
   * @function Reads the given value at the given word
   * @param r the word-register to read
   * @returns {Number}
   */
  yasp.Emulator.prototype.readWordRegister = function (r) {
    if(r < 0 || r > 32)
      return -1;

    r = r * 2;
    var b1 = this.ram[r];
    var b2 = this.ram[r + 1];
    var w = yasp.bitutils.wordFromBytes(b1, b2);

    return w;
  };

  /**
   * @function Reads the flags
   * @returns object containing the flag-values
   */
  yasp.Emulator.prototype.readFlags = function () {
    return {
      c: this.flags.c,
      z: this.flags.z
    }
  };

  /**
   * @function Write the flags
   * @param c the carry flag to be set (or null)
   * @param z the zero flag to be set (or null)
   */
  yasp.Emulator.prototype.writeFlags = function (c, z) {
    if(c !== null)
      this.flags.c = c;
    if(z !== null)
      this.flags.z = z;
  };

  yasp.Emulator.prototype.tick = function () {
    if(this.running == false && !this.stepping) {
      setTimeout(this.tick.bind(this), tickTimeout);
      return;
    }

    var ppc = this.pc;
    var neededBytes;
    var parts;
    var cmd;

    var cachedCmd = this.commandCache[this.pc];

    if(!cachedCmd)
    {
      parts = [ ];
      var bytes = [ this.rom[ppc++] ];

      for (var i = 0; i < yasp.commands.length; i++) {
        cmd = yasp.commands[i];
        parts.length = 0;

        for (var j = 0; j < cmd.code.length; j++) {
          if(typeof cmd.code[j].value == "string")
            parts.push(cmd.code[j].value.length);
          else if(!isNaN((+cmd.code[j].value)))
            parts.push(8);
        }

        for (var j = 0; j < cmd.params.length; j++) {
          var len = yasp.ParamType[cmd.params[j].type].len;
          parts.push(len);
        }

        neededBytes = 0;

        for (var j = 0; j < parts.length; j++) {
          neededBytes += parts[j];
        }
        neededBytes = ~~(neededBytes / 8);

        if(neededBytes > bytes.length) {
          for (var j = bytes.length; j < neededBytes; j++) {
            bytes.push(this.rom[ppc++]);
          }
        }

        yasp.bitutils.extractBits(bytes, parts, parts);

        var matches = true;

        for (var k = 0; k < cmd.code.length; k++) {
          var cc = cmd.code[k].value;
          if(typeof cc == "string")
            cc = parseInt(cc, 2);

          if(cc != parts[k])
          {
            matches = false;
            break;
          }
        }

        if(matches) {
          break;
        }

        cmd = null;
      }

      if(cmd == null) {
        throw "Invalid Instruction at " + this.pc;
      }

      this.commandCache[this.pc] = { cmd: cmd, parts: parts, neededBytes: neededBytes };
    }
    else
    {
      cmd = cachedCmd.cmd;
      neededBytes = cachedCmd.neededBytes;
      parts = cachedCmd.parts;
    }

    this.pc += neededBytes;

    var params = [ ];

    var strCmd = cmd.name + " ";

    for (var i = 0; i < cmd.params.length; i++) {
      var param = { type: cmd.params[i].type, value: null, address: null };
      var part = parts[cmd.code.length + i];

      switch (cmd.params[i].type) {
        case "r_byte":
          param.value = this.readByteRegister(part);
          param.address = part;
          strCmd += "b" + part;
          break;
        case "r_word":
          param.value = this.readWordRegister(part);
          param.address = part;
          strCmd += "w" + part;
          break;
        case "l_byte":
          param.value = part;
          param.address = null;
          strCmd += part;
          break;
        case "l_word":
          param.value = part;
          param.address = null;
          strCmd += part;
          break;
        case "pin":
          param.value = part;
          param.address = null;
          strCmd += part;
          break;
        case "address":
          param.value = part;
          param.address = null;
          strCmd += part;
          break;
      }

      strCmd += i == cmd.params.length - 1 ? "" : ",";

      params.push(param);
    }

    if(debug) console.log(strCmd);
    cmd.exec.apply(this, params);

    if(cmd.checkFlags)
    {
      var firstP = params[0];
      var newVal;

      if(firstP.type == "r_byte")
        newVal = this.readByteRegister(firstP.address);
      else if(firstP.type == "r_word")
        newVal = this.readWordRegister(firstP.address);

      var z = null;

      if(cmd.checkFlags.z)
      {
        z = (newVal === 0);
      }

      this.writeFlags(null, z);
    }

    if(!this.stepping) {
      setTimeout(this.tick.bind(this), tickTimeout);
    }
  };
})();
