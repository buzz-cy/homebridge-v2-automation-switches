'use strict';

module.exports = {
  registerWith: function (hap) {
    const { Characteristic, Service } = hap;

    class AutomationActive extends Characteristic {
      constructor() {
        super('Automation Active', 'F27A4F93-50BF-4D9A-BD08-2518B1D0D7B6');
        this.setProps({
          format: Characteristic.Formats.BOOL,
          perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    }
    Characteristic.AutomationActive = AutomationActive;
  }
};