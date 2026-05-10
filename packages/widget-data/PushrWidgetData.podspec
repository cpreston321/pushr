require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'PushrWidgetData'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'ISC'
  s.author         = ''
  s.homepage       = 'https://pushr.sh'
  # Match the main app's deployment target. The widget target itself uses a
  # newer iOS via its own expo-target.config.json — this module only needs
  # the App Group bridge, which has worked since iOS 8.
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = 'ios/PushrWidgetDataModule.swift'
end
