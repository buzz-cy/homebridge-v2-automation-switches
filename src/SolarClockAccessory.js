'use strict';

const clone = require('clone');
const SunCalc = require('suncalc');

let Accessory, Characteristic, Service;

class SolarClockAccessory {

  constructor(api, log, config, storage) {
    Accessory = api.hap.Accessory;
    Characteristic = api.hap.Characteristic;
    Service = api.hap.Service;

    this.api = api;
    this.log = log;
    this.name = config.name.replace(/[^a-zA-Z0-9 ']/g, '').trim();
    if (!/^[a-zA-Z0-9]/.test(this.name)) {
        this.name = 'Accessory ' + this.name;
    }
    this._storage = storage;
    this._config = config;

    if (config.location && config.location.latitude !== undefined && config.location.longitude !== undefined) {
      this.latitude = config.location.latitude;
      this.longitude = config.location.longitude;
    } else {
      this.log(`Warning: Missing latitude/longitude for solar calculation.`);
      this.latitude = 0;
      this.longitude = 0;
    }

    const validPeriods = ["night", "morning twilight", "sunrise", "daytime", "solarNoon", "sunset", "evening twilight"];
    if (!validPeriods.includes(config.period)) {
      this.log(`Invalid period "${config.period}", defaulting to "sunrise".`);
      this._config.period = "sunrise";
    }

    this._state = {
      period: config.period,
      offset: config.offset !== undefined ? config.offset : 0,
      enabled: config.enabled !== undefined ? config.enabled : true,
      solarOffset: 0,
      schedule: [],
      sunriseOffset: config.sunriseOffset !== undefined ? config.sunriseOffset : 0,
      sunsetOffset: config.sunsetOffset !== undefined ? config.sunsetOffset : 0
    };

    if (config.stored) {
      this._restoreState();
    }

    this._services = this.createServices();
  }

  getServices() {
    return this._services;
  }

  createServices() {
    return [
      this.getAccessoryInformationService(),
      this.getSolarClockService(),
      this.getSolarLocationService(),
      this.getContactSensorService()
    ];
  }

  getAccessoryInformationService() {
    return new Service.AccessoryInformation()
    .setCharacteristic(Characteristic.Name, this.name)
    .setCharacteristic(Characteristic.Manufacturer, "Homebridge Automation Switches")
    .setCharacteristic(Characteristic.Model, "Solar Clock")
    .setCharacteristic(Characteristic.SerialNumber, this._config.serialNumber || 'Unknown')
    .setCharacteristic(Characteristic.FirmwareRevision, this._config.version || '1.0.0')
    .setCharacteristic(Characteristic.HardwareRevision, this._config.version || '1.0.0');

  }

  getSolarClockService() {
    if (!this._clockService) {
        this._clockService = new Service.Switch(this.name, 'SolarClockService');
    }

    this._clockService.getCharacteristic(Characteristic.On)
        .onSet(async (value) => {
            this.log(`User changed state of ${this.name} to ${value}`);

            this._state.enabled = value;
            await this._persist(this._state);

            if (value) {
                await this._scheduleSolarClock();  // Ensure scheduling is completed
            } else {
                await this._cancelScheduledEvents(); // Ensure cancellation is completed
            }

            setTimeout(() => {
                this._clockService.getCharacteristic(Characteristic.On).updateValue(this._state.enabled);
            }, 500);
        })
        .onGet(() => {
            return this._state.enabled;
        });

    return this._clockService;
  }

  getSolarLocationService() {
    this._solarLocationService = new Service.LightSensor(this.name, "SolarLocationService");
    this._solarLocationService
      .getCharacteristic(Characteristic.CurrentAmbientLightLevel)
      .onGet(() => this._state.solarOffset || 0.0001);

    return this._solarLocationService;
  }

  getContactSensorService() {
    this._contactSensorService = new Service.ContactSensor(this.name, "ContactSensorService");
    this._contactSensorService
      .getCharacteristic(Characteristic.ContactSensorState)
      .updateValue(Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
    return this._contactSensorService;
  }

  async _handleUserChange(value) {
    this.log(`User changed state of ${this.name} to ${value}`);
    this._state.enabled = value;

    this._clockService.getCharacteristic(Characteristic.On).updateValue(this._state.enabled);
    this._clockService.getCharacteristic(Characteristic.On).emit('change', { newValue: this._state.enabled });

    await this._persist(this._state);

    if (value) {
        this._scheduleSolarClock();
    } else {
        this._cancelScheduledEvents();
    }
  }

  async _restoreState() {
    try {
        const storedState = await this._storage.retrieve();

        if (storedState) {
            this._state = { ...this._state, ...storedState };

            this._state.period = storedState.period ?? this._config.period;
            this._state.offset = storedState.offset ?? this._config.offset;
            this._state.enabled = storedState.enabled ?? this._config.enabled;

            this.log(`Restored period: ${this._state.period}, offset: ${this._state.offset}, enabled: ${this._state.enabled}`);
        } else {
            this.log(`No stored state found for ${this.name}, using defaults.`);
            this._state.period = this._config.period;
            this._state.offset = this._config.offset;
            this._state.enabled = this._config.enabled;
        }

        this._clockService.getCharacteristic(Characteristic.On).updateValue(this._state.enabled);

        this._scheduleSolarClock(); // Reschedule solar event after restoring

    } catch (error) {
        this.log(`Failed to restore state for ${this.name}: ${error}`);
    }
  }

  async _persist(data) {
    try {
        data.period = this._state.period;
        data.offset = this._state.offset;
        data.enabled = this._state.enabled;

        await this._storage.store(data);
        this._state = { ...this._state, ...data };

        this._clockService.getCharacteristic(Characteristic.On).updateValue(this._state.enabled);

        this.log(`Persisted solar state: ${JSON.stringify(this._state)}`);

    } catch (error) {
        this.log(`Failed to persist solar state: ${error}`);
    }
  }

  _updateCharacteristics() {
    this._solarClockService.getCharacteristic(Characteristic.On).updateValue(this._state.enabled);
    this._solarLocationService.getCharacteristic(Characteristic.CurrentAmbientLightLevel).updateValue(this._state.solarOffset || 0.0001);
  }

  async _scheduleSolarClock() {
    const nextEventTime = this._calculateNextEventTime(this._state.period);

    if (!nextEventTime) {
        this.log(`Failed to schedule solar event, invalid time.`);
        return;
    }

    const delay = nextEventTime.getTime() - Date.now();
    
    if (delay <= 0) {
        this.log(`Event time for ${this._state.period} (${nextEventTime}) has already passed. Scheduling for tomorrow.`);
        this._scheduleSolarClockForTomorrow();
        return;
    }

    this.log(`Scheduled next solar event at: ${nextEventTime}`);

    this._eventTimer = setTimeout(() => this._triggerSolarEvent(), delay);

    this._state.enabled = true;
    this._clockService.getCharacteristic(Characteristic.On).updateValue(true);
    this._clockService.getCharacteristic(Characteristic.On).emit('change', { newValue: true });

    await this._persist(this._state);
  }

  async _triggerSolarEvent() {
    this.log(`Triggering solar event for ${this.name}`);

    this._state.enabled = true;
    this._clockService.getCharacteristic(Characteristic.On).updateValue(true);
    this._clockService.getCharacteristic(Characteristic.On).emit('change', { newValue: true });

    await this._persist(this._state);

    this._scheduleSolarClock();
  }

  _cancelScheduledEvents() {
    this.log(`Canceling all scheduled solar events for ${this.name}.`);
    clearTimeout(this._timer);
  }

  _calculateNextEventTime(event) {
    const times = SunCalc.getTimes(new Date(), this.latitude, this.longitude);
    if (!times[event]) {
        this.log(`Event ${event} is not valid.`);
        return null;
    }

    let eventTime = new Date(times[event].getTime());
    eventTime.setMinutes(eventTime.getMinutes() + this._state.offset);

    const now = new Date();
    if (eventTime <= now) {
        this.log(`Event time for ${event} (${eventTime}) has already passed. Scheduling for tomorrow.`);
        eventTime.setDate(eventTime.getDate() + 1);
    }

    return eventTime;
  }
}

module.exports = SolarClockAccessory;
