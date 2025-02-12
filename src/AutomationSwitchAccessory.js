'use strict';

const clone = require('clone');

let Accessory, Characteristic, Service;

class AutomationSwitchAccessory {
  constructor(api, log, config, storage) {
    if (!api || !api.hap) {
      throw new Error("🚨 Homebridge API (hap) is undefined! Ensure the accessory is registered correctly.");
    }
    if (!log || typeof log !== "function") {
        throw new Error("🚨 log is undefined or not a function in AutomationSwitchAccessory.js. Check constructor arguments.");
    }
      
    //  this.log = log;  // ✅ Assign log first
    //  this.log("Initializing Automation Switch Accessory:", config.name);
  
    this.api = api;
    this.hap = api.hap;

    Accessory = api.platformAccessory; // Use platformAccessory API
    Characteristic = api.hap.Characteristic;
    Service = api.hap.Service;

    this.log = log;
    this.log("Available Accessory Categories:", JSON.stringify(this.api.hap.Accessory.Categories || {}));

    this.name = config.name.replace(/[^a-zA-Z0-9 ']/g, '').trim();
    if (!/^[a-zA-Z0-9]/.test(this.name)) {
        this.name = 'Accessory ' + this.name;
    }
    this._config = config;
    this._storage = storage;
    this._timer = undefined;


    this._state = {
      autoOff: config.autoOff || false,
      period: config.period || 60,
      state: config.default !== undefined ? !!config.default : false,
      stored: config.stored || false
    };

    if (this._state.stored) {
        this._restoreState();
    } else {
        this.log(`No persistent storage for ${this.name}, using defaults.`);
    }

    // Fix for UUID conflict: Assign unique subtypes
    this.accessory = new this.api.platformAccessory(
      this.name,
      this.api.hap.uuid.generate(this.name),
      (this.api.hap.Accessory.Categories ? this.api.hap.Accessory.Categories.OTHER : 1)
    );

    this.services = this.createServices();
    // Restart timer if automation was ON before restart
    if (this._state.state) {
        this._startTimer();
    }

  }

  getServices() {
    return this.services;
  }

  createServices() {
    return [
      this.getAccessoryInformationService(),
      this.getSwitchService(),
      this.getSwitchProgramService(),
      //this._motionSensor 
      //this.getMotionSensorService()
    ];
  }

  getAccessoryInformationService() {
    return new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Manufacturer, 'Buzz-cy')
      .setCharacteristic(Characteristic.Model, 'Automation Switch')
      .setCharacteristic(Characteristic.SerialNumber, this._config.serialNumber || 'Unknown')
      .setCharacteristic(Characteristic.FirmwareRevision, this._config.version || '1.0.0')
      .setCharacteristic(Characteristic.HardwareRevision, this._config.version || '1.0.0');
  }

  getSwitchService() {
    this._switchService = new Service.Switch(this.name, "SwitchService");
    this._switchService
      .getCharacteristic(Characteristic.On)
      .onSet(this._setOn.bind(this))
      .updateValue(this._state.state);
    return this._switchService;
  }

  getSwitchProgramService() {
    this._programService = new Service.MotionSensor(`${this.name} Program`, "SwitchProgramService");

    this._programService
      .getCharacteristic(Characteristic.MotionDetected)
      .updateValue(false);

    this._switchService.addLinkedService(this._programService); 

    return this._programService;
  }

  async _setOn(value) {
    this.log(`Setting switch state to ${value} for ${this.name}`);

    if (value === this._state.state) {
        this.log(`Switch state is already ${value}, no update needed.`);
        return;
    }

    this._state.state = value;

    if (this._switchService) {
        this._switchService.getCharacteristic(Characteristic.On).updateValue(value);
    }
    if (this._programService) {
        this._programService.getCharacteristic(Characteristic.MotionDetected).updateValue(value);
    }

    if (value) {
        this._startTimer();
        this.log(`Timer started for ${this.name}`);
    }

    await this._persist(this._state);
}

  async _setPeriod(value, callback) {
    this.log(`Setting period value: ${value}s`);
    const data = clone(this._state);
    data.period = value;
    await this._persist(data, callback);
  }

  async _setAutoOff(value, callback) {
    this.log(`Setting auto off value ${value}`);
    const data = clone(this._state);
    data.autoOff = value;
    await this._persist(data, callback);
  }

  _startTimer() {
    const delay = this._state.period * 1000;
    this.log(`Starting timer for ${delay}ms`);
    this._timer = setTimeout(this._onTimeout.bind(this), delay);
  }

  _resetTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = undefined;
    }
  }

  async _onTimeout() {
    this._timer = undefined;
    this.log(`Timer expired for ${this.name}`);

    if (this._state.autoOff) {
      this.onTimerExpired();
    }
}

  async onTimerExpired() {
    this.log(`Timer expired for ${this.name}`);

    if (this._state.autoOff) {
        this.log('Auto-off is enabled, resetting switch');
        this._state.state = false; 
        this._switchService.getCharacteristic(Characteristic.On).updateValue(false);
        this._programService.getCharacteristic(Characteristic.MotionDetected).updateValue(false);

        const data = clone(this._state);
        data.state = false;
        await this._persist(data);

        this._switchService
            .getCharacteristic(Characteristic.On)
            .updateValue(false);
        
        this.signalMotion(false);
    } else {
        this.log('Auto-off is disabled, maintaining user state');
        this.signalMotion(false);
        setTimeout(() => this.nextPeriod(), 1000);
    }
  }

  signalMotion(motion) {
    if (!this._motionSensor) {
        this.log(`MotionSensor service not initialized for ${this.name}`);
        return;
    }

    this._motionSensor
        .getCharacteristic(Characteristic.MotionDetected)
        .updateValue(motion);
  }

  nextPeriod() {
    if (this._motionSensor) {
        this.signalMotion(false);
    }
    if (!this._state.autoOff) {
        this._startTimer();
    }
  }

  _persist(data) {
    if (!this._state.stored) {
        this.log(`Persistent storage disabled for ${this.name}, skipping save.`);
        return;
    }

    this._storage.store(data, (error) => {
        if (error) {
            this.log(`Failed to persist state: ${error}`);
            return;
        }

        this._state = data;

        if (this._switchService) {
            this._switchService.getCharacteristic(Characteristic.On).updateValue(this._state.state);
        }
        if (this._programService) {
            this._programService.getCharacteristic(Characteristic.MotionDetected).updateValue(this._state.state);
        }
    });
  }

  async _restoreState() {
    if (!this._storage) {
      this.log(`Storage not initialized for ${this.name}`);
      return;
    }

    try {
      const restoredState = await this._storage.retrieve();

      if (restoredState) {
        this._state = restoredState;
        this._switchService.getCharacteristic(Characteristic.On).updateValue(this._state.state);

        if (this._programService) {
          this._programService.getCharacteristic(Characteristic.MotionDetected).updateValue(this._state.state);
        }

        // Restart timer if automation was ON before restart
        if (this._state.state) {
            this.log(`Timer was active before restart, restarting it now.`);
            this._startTimer();
        }
      } else {
        this.log(`No stored state found for ${this.name}, using defaults.`);
      }
    } catch (error) {
      this.log(`Error restoring state for ${this.name}: ${error.message}`);
    }
  }

}

module.exports = AutomationSwitchAccessory;