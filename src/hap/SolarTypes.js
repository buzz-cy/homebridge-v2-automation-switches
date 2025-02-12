'use strict';

module.exports = {
  registerWith: function (hap) {
    const { Characteristic, Service } = hap;

    class SolarLatitude extends Characteristic {
      constructor() {
        super('Latitude', '6FE198BF-29F2-493F-8B27-B60FE795C3A3');
        this.setProps({
          format: Characteristic.Formats.FLOAT,
          unit: Characteristic.Units.ARC_DEGREE,
          minValue: -90,
          maxValue: 90,
          minStep: 0.000001,
          perms: [Characteristic.Perms.READ],
        });
        this.value = this.getDefaultValue();
      }
    }
    Characteristic.SolarLatitude = SolarLatitude;

    class SolarLongitude extends Characteristic {
      constructor() {
        super('Longitude', '9611DA9C-8F1A-4B23-A391-0973B7A9039D');
        this.setProps({
          format: Characteristic.Formats.FLOAT,
          unit: Characteristic.Units.ARC_DEGREE,
          minValue: -180,
          maxValue: 180,
          minStep: 0.000001,
          perms: [Characteristic.Perms.READ],
        });
        this.value = this.getDefaultValue();
      }
    }
    Characteristic.SolarLongitude = SolarLongitude;

    class SolarMinutesOffset extends Characteristic {
      constructor() {
        super('Offset', '09147249-07BC-4DB4-B916-31B77CD6EE13');
        this.setProps({
          format: Characteristic.Formats.INT,
          unit: 'mins',
          minValue: -15,
          maxValue: 15,
          minStep: 1,
          perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE],
        });
        this.value = this.getDefaultValue();
      }
    }
    Characteristic.SolarMinutesOffset = SolarMinutesOffset;

    class SolarPeriod extends Characteristic {
      constructor() {
        super('Period', '4D640A06-34FE-45D7-BF7C-736BB2CF5693');
        this.setProps({
          format: Characteristic.Formats.UINT8,
          minValue: 0,
          maxValue: 5,
          minStep: 1,
          perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY],
        });
        
        this.value = this.getDefaultValue();
      }
    }
    Characteristic.SolarPeriod = SolarPeriod;

    class SolarService extends Service {
      constructor(displayName, subtype) {
        super(displayName, 'F9305C45-DBC5-4BD1-B4DA-C67A495288CD', subtype);
        this.addCharacteristic(Characteristic.SolarPeriod);
        this.addCharacteristic(Characteristic.SolarMinutesOffset);
      }
    }
    Service.Solar = SolarService;

    class SolarLocationService extends Service {
      constructor(displayName, subtype) {
        super(displayName, '0C982673-8293-4CE4-8AC3-9371980D81A7', subtype);
        this.addCharacteristic(Characteristic.SolarLatitude);
        this.addCharacteristic(Characteristic.SolarLongitude);
      }
    }
    Service.SolarLocation = SolarLocationService;
  }
};
