
const util = require('util');

const version = require('../package.json').version;

const AutomationSwitchAccessory = require('./AutomationSwitchAccessory');
const SecuritySystemAccessory = require('./SecuritySystemAccessory');
const LockMechanismAccessory = require('./LockMechanismAccessory');
const SwitchAccessory = require('./SwitchAccessory');
const SliderAccessory = require('./SliderAccessory');
const AlarmClockAccessory = require('./AlarmClockAccessory');
const SolarClockAccessory = require('./SolarClockAccessory');
const RandomAccessory = require('./RandomAccessory');

const StorageWrapper = require('./util/StorageWrapper');
const FakeStorageWrapper = require('./util/FakeStorageWrapper');
const SerialNumberGenerator = require('./util/SerialNumberGenerator');

const HomeKitTypes = require('./HomeKitTypes');
const ClockTypes = require('./hap/ClockTypes');
const SolarTypes = require('./hap/SolarTypes');
const RandomTypes = require('./hap/RandomTypes');
const AutomationSwitchTypes = require('./hap/AutomationSwitchTypes');

const HOMEBRIDGE = {
  Accessory: null,
  Service: null,
  Characteristic: null,
  UUIDGen: null
};

module.exports = (api) => {
  HOMEBRIDGE.Accessory = api.platformAccessory;
  HOMEBRIDGE.Service = api.hap.Service;
  HOMEBRIDGE.Characteristic = api.hap.Characteristic;
  HOMEBRIDGE.UUIDGen = api.hap.uuid;

  api.registerPlatform("homebridge-v2-automation-switches", "AutomationSwitches", AutomationSwitchesPlatform);
};

const SerialNumberPrefixes = {
  automation: 'AU',
  lock: 'LK',
  security: 'SC',
  switch: 'SW',
  slider: 'SL',
  alarmclock: 'AC',
  solarclock: 'BC',
  random: 'RA'
};

class AutomationSwitchesPlatform {
  constructor(log, config, api) {
    if (!log || typeof log !== "function") {
      throw new Error("log is undefined or not a function in AutomationSwitchesPlatform. Check plugin registration.");
    }
    this.log = log;
    this.log(`AutomationSwitchesPlatform Plugin Loaded - Version ${version}`);
    this.config = config;
    this.api = api;

    HomeKitTypes.registerWith(api.hap);
    ClockTypes.registerWith(api.hap);
    SolarTypes.registerWith(api.hap);
    RandomTypes.registerWith(api.hap);
    AutomationSwitchTypes.registerWith(api.hap);

    this._factories = {
      automation: this._createAutomationSwitch.bind(this),
      lock: this._createLockMechanism.bind(this),
      security: this._createSecuritySwitch.bind(this),
      switch: this._createSwitch.bind(this),
      slider: this._createSlider.bind(this),
      alarmclock: this._createAlarmClock.bind(this),
      solarclock: this._createSolarClock.bind(this),
      random: this._createRandom.bind(this)
    };

    this.api.on('didFinishLaunching', () => {
      this._registerAccessories();
    });
  }

  _registerAccessories() {
    const _accessories = [];
    const { switches } = this.config;

    if (!switches || !Array.isArray(switches)) {
      this.log.warn("No valid switches found in config.json.");
      return;
    }

    switches.forEach(sw => {
      if (!sw.name || sw.name.trim().length === 0) {
        this.log.error("Invalid configuration: Automation switch name is missing.");
        return;
      }

      if (!sw.type) {
        this.log(`⚠️ ${sw.name} does not specify a type. Defaulting to 'automation'.`);
        sw.type = 'automation';
      }

      const factory = this._factories[sw.type];
      if (!factory) {
        this.log(`Unknown switch type for ${sw.name}: ${util.inspect(sw)}`);
        return;
      }

      sw.serialNumber = SerialNumberGenerator.generate(SerialNumberPrefixes[sw.type], sw.name);

      const storage = this._createStorage(sw);
      const accessory = factory(sw, storage);
      _accessories.push(accessory);
    });

    if (_accessories.length > 0) {
      this.api.registerPlatformAccessories("homebridge-v2-automation-switches", "AutomationSwitches", _accessories);
      this.log(`Successfully registered ${_accessories.length} accessories.`);
    } else {
      this.log.warn("No accessories were successfully registered.");
    }
  }

  _createStorage(sw) {
    return this._shouldStoreSwitchState(sw)
      ? new StorageWrapper(this.api, this.log, this._sanitizeTypeForStorage(sw.type), sw.name)
      : new FakeStorageWrapper();
  }

  _shouldStoreSwitchState(sw) {
    return sw.stored === true || (sw.type === 'security' && sw.stored !== false);
  }

  _sanitizeTypeForStorage(type) {
    return type === 'security' ? 'SecuritySystem' : type;
  }

  _createAutomationSwitch(sw, storage) {
    sw.autoOff = sw.autoOff !== undefined ? sw.autoOff : true;
    sw.period = sw.period || 60;
    sw.version = version;
    const uuid = this.api.hap.uuid.generate(sw.serialNumber);
    const accessory = new this.api.platformAccessory(sw.name, uuid);
  
    const automationSwitch = new AutomationSwitchAccessory(this.api, this.log, sw, storage);
    
    automationSwitch.getServices().forEach(service => {
        if (!(service instanceof this.api.hap.Service.AccessoryInformation)) {
            accessory.addService(service);
        }
    });

    return accessory;
  }

    _createSecuritySwitch(sw, storage) {
      sw.version = version;
      const uuid = this.api.hap.uuid.generate(sw.serialNumber);
      const accessory = new this.api.platformAccessory(sw.name, uuid);
      
      const securitySwitch = new SecuritySystemAccessory(this.api, this.log, sw, storage);

      securitySwitch.getServices().forEach(service => {
          if (!(service instanceof this.api.hap.Service.AccessoryInformation)) {
              accessory.addService(service);
          }
      });

      return accessory;
  }

  _createLockMechanism(sw, storage) {
      sw.version = version;
      const uuid = this.api.hap.uuid.generate(sw.serialNumber);
      const accessory = new this.api.platformAccessory(sw.name, uuid);
      
      const lockMechanism = new LockMechanismAccessory(this.api, this.log, sw, storage);

      lockMechanism.getServices().forEach(service => {
          if (!(service instanceof this.api.hap.Service.AccessoryInformation)) {
              accessory.addService(service);
          }
      });

      return accessory;
  }

  _createSwitch(sw, storage) {
      sw.version = version;
      const uuid = this.api.hap.uuid.generate(sw.serialNumber);
      const accessory = new this.api.platformAccessory(sw.name, uuid);
      
      const switchAccessory = new SwitchAccessory(this.api, this.log, sw, storage);

      switchAccessory.getServices().forEach(service => {
          if (!(service instanceof this.api.hap.Service.AccessoryInformation)) {
              accessory.addService(service);
          }
      });

      return accessory;
  }

  _createSlider(sw, storage) {
      sw.version = version;
      const uuid = this.api.hap.uuid.generate(sw.serialNumber);
      const accessory = new this.api.platformAccessory(sw.name, uuid);
      
      const sliderAccessory = new SliderAccessory(this.api, this.log, sw, storage);

      sliderAccessory.getServices().forEach(service => {
          if (!(service instanceof this.api.hap.Service.AccessoryInformation)) {
              accessory.addService(service);
          }
      });

      return accessory;
  }

  _createAlarmClock(sw, storage) {
      sw.version = version;
      const uuid = this.api.hap.uuid.generate(sw.serialNumber);
      const accessory = new this.api.platformAccessory(sw.name, uuid);
      
      const alarmClockAccessory = new AlarmClockAccessory(this.api, this.log, sw, storage);

      alarmClockAccessory.getServices().forEach(service => {
          if (!(service instanceof this.api.hap.Service.AccessoryInformation)) {
              accessory.addService(service);
          }
      });

      return accessory;
  }

  _createSolarClock(sw, storage) {
    sw.version = version;
    const uuid = this.api.hap.uuid.generate(sw.serialNumber);
    const accessory = new this.api.platformAccessory(sw.name, uuid);
    
    const solarClock = new SolarClockAccessory(this.api, this.log, sw, storage);

    solarClock.getServices().forEach((service, index) => {
      if (!(service instanceof this.api.hap.Service.AccessoryInformation)) {
          const existingService = accessory.getService(service.UUID);
          if (existingService) {
              accessory.removeService(existingService); // Remove duplicates
          }
          accessory.addService(service, `${sw.name} Service ${index}`);
      }
    });

    return accessory;
  }

  _createRandom(sw, storage) {
      sw.version = version;
      const uuid = this.api.hap.uuid.generate(sw.serialNumber);
      const accessory = new this.api.platformAccessory(sw.name, uuid);
      
      const randomAccessory = new RandomAccessory(this.api, this.log, sw, storage);

      randomAccessory.getServices().forEach(service => {
          if (!(service instanceof this.api.hap.Service.AccessoryInformation)) {
              accessory.addService(service);
          }
      });

      return accessory;
  }
};
