'use strict';

const clone = require('clone');
const moment = require('moment-timezone');

let Accessory, Characteristic, Service;

class AlarmClockAccessory {

  constructor(api, log, config, storage) {
    Accessory = api.hap.Accessory;
    Characteristic = api.hap.Characteristic;
    Service = api.hap.Service;

    this.log = log;
    this.name = config.name.replace(/[^a-zA-Z0-9 ']/g, '').trim();
    if (!/^[a-zA-Z0-9]/.test(this.name)) {
        this.name = 'Accessory ' + this.name;
    }
    this._config = config;
    this._storage = storage;

    this._state = {
      hour: config.defaultHour !== undefined ? config.defaultHour : 9,
      minute: config.defaultMinute !== undefined ? config.defaultMinute : 0,
      timezone: config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      enabled: config.enabled !== undefined ? config.enabled : true
    };

    if (!this._state.timezone) {
      this.log(`⚠️ Timezone is undefined, setting to UTC`);
      this._state.timezone = 'UTC';
    }

    this._restoreState();
    this._services = this.createServices();
  }

  getServices() {
    return this._services;
  }

  createServices() {
    return [
      this.getAccessoryInformationService(),
      this.getClockService(),
      this.getEnabledSwitchService(),
      this.getContactSensorService()
    ];
  }

  getAccessoryInformationService() {
    return new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Manufacturer, 'Buzz-cy')
      .setCharacteristic(Characteristic.Model, 'Alarm Clock')
      .setCharacteristic(Characteristic.SerialNumber, this._config.serialNumber)
      .setCharacteristic(Characteristic.FirmwareRevision, this._config.version)
      .setCharacteristic(Characteristic.HardwareRevision, this._config.version);
  }

  getBridgingStateService() {
    return new Service.BridgingState()
      .setCharacteristic(Characteristic.Reachable, true)
      .setCharacteristic(Characteristic.LinkQuality, 4)
      .setCharacteristic(Characteristic.AccessoryIdentifier, this.name)
      .setCharacteristic(Characteristic.Category, Accessory.Categories.SWITCH);
  }

  getClockService() {
    this._clockService = new Service.Lightbulb(this.name); 

    this._clockService.getCharacteristic(Characteristic.On)
      .on('set', this._setEnabledState.bind(this))
      .on('get', callback => callback(null, this._state.enabled));

      this._clockService.getCharacteristic(Characteristic.Brightness)
      .on('set', async (value, callback) => {
          value = Math.max(0.0001, Math.min(value, 100)); // Ensure valid range
  
          this.log(`Setting brightness for ${this.name} to ${value}`);
          this._state.brightness = value;
  
          try {
              await this._persist(this._state);
              this.log(`Brightness updated successfully: ${value}`);
              callback();
          } catch (error) {
              this.log(`Failed to persist brightness: ${error}`);
              callback(error);
          }
      })
      .on('get', callback => {
          callback(null, this._state.brightness || 50);
      });

    return this._clockService;
  }

  getEnabledSwitchService() {
    this._enabledService = new Service.Switch(this.name + " Enabled");
    this._enabledService.getCharacteristic(Characteristic.On)
      .on('set', this._setEnabledState.bind(this))
      .on('get', callback => callback(null, this._state.enabled));

    return this._enabledService;
  }

  getContactSensorService() {
    this._contactSensorService = new Service.ContactSensor(this.name + " Trigger");
    this._contactSensorService.getCharacteristic(Characteristic.ContactSensorState)
      .on('get', callback => callback(null, this._state.enabled ? Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED));

    return this._contactSensorService;
  }

  async _setEnabledState(value, callback) {
    this.log(`Changing enabled state of ${this.name} to ${value}`);
    this._state.enabled = value;

    this._clockService.getCharacteristic(Characteristic.On).updateValue(value);
    this._enabledService.getCharacteristic(Characteristic.On).updateValue(value);

    try {
        await this._persist(this._state);
        this.log(`Alarm ${this.name} is now ${value ? 'enabled' : 'disabled'}`);
        callback();
    } catch (error) {
        this.log(`Failed to persist alarm state: ${error}`);
        callback(error);
    }
  }

  async _setAlarmTime(value, callback) {
    if (!Number.isFinite(value)) {
        this.log(`Invalid alarm time received: ${value}. Resetting to default.`);
        value = 9 * 60; //TO DO
    }

    let newHour = Math.floor(value / 60);
    let newMinute = value % 60;

    this.log(`Setting new alarm time for ${this.name}: ${newHour}:${newMinute}`);

    this._state.hour = newHour;
    this._state.minute = newMinute;

    try {
        await this._persist(this._state);
        this.log(`Alarm time updated successfully: ${newHour}:${newMinute}`);
        this._scheduleAlarmClock();
        callback();
    } catch (error) {
        this.log(`Failed to persist alarm time: ${error}`);
        callback(error);
    }
  }

  _scheduleAlarmClock() {
    if (this._alarmTimeout) {
      clearTimeout(this._alarmTimeout);
    }

    let now = moment().tz(this._state.timezone);
    let alarmTime = now.clone().hour(this._state.hour).minute(this._state.minute).second(0);

    if (alarmTime.isBefore(now)) {
      alarmTime.add(1, 'day');
    }

    let delay = alarmTime.diff(now);

    this.log(`Scheduling next alarm for ${this.name} at ${alarmTime.format('LLLL')}`);

    this._alarmTimeout = setTimeout(() => this._alarm(), delay);
  }

  _alarm() {
    this.log(`Alarm triggered for ${this.name}`);

    if (this._contactSensorService) {
      this._contactSensorService.getCharacteristic(Characteristic.ContactSensorState)
        .updateValue(Characteristic.ContactSensorState.CONTACT_DETECTED);
    }

    if (this._clockService) {
      this._clockService.getCharacteristic(Characteristic.On)
        .updateValue(true);
    }

    setTimeout(() => this._silenceAlarm(), 60000); 
  }

  _silenceAlarm() {
    this.log(`Silencing alarm for ${this.name}`);

    if (this._contactSensorService) {
      this._contactSensorService.getCharacteristic(Characteristic.ContactSensorState)
        .updateValue(Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
    }

    if (this._clockService) {
      this._clockService.getCharacteristic(Characteristic.On)
        .updateValue(false);
    }

    this._scheduleAlarmClock();
  }

  async _persist(data) {
    try {
        await this._storage.store(data);
        this._state = { ...this._state, ...data };

        this._clockService.getCharacteristic(Characteristic.On).updateValue(this._state.enabled);
        this._clockService.getCharacteristic(Characteristic.Brightness).updateValue(this._state.brightness || 50);
        this._enabledService.getCharacteristic(Characteristic.On).updateValue(this._state.enabled);
    } catch (error) {
        this.log(`Failed to persist alarm state: ${error}`);
    }
  }

  async _restoreState() {
    try {
        const storedState = await this._storage.retrieve();
        
        if (storedState) {
            this._state = { ...this._state, ...storedState };
        } else {
            this.log(`No stored state found for ${this.name}, using defaults.`);
        }

        this._clockService.getCharacteristic(Characteristic.On).updateValue(this._state.enabled);
        this._clockService.getCharacteristic(Characteristic.Brightness).updateValue(this._state.brightness || 50);
        this._enabledService.getCharacteristic(Characteristic.On).updateValue(this._state.enabled);

        this._scheduleAlarmClock(); // Reschedule alarm after restoring
    } catch (error) {
        this.log(`Failed to restore state for ${this.name}: ${error}`);
    }
  }

}

module.exports = AlarmClockAccessory;