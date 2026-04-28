require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'PushrLiveActivity'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'ISC'
  s.author         = ''
  s.homepage       = 'https://pushr.sh'
  # Match the main app's deployment target; ActivityKit usage is guarded by
  # `@available(iOS 16.2, *)` inside Swift so iOS 15.x builds still link.
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  # Only the Module and shared attributes ship in the main app target.
  # The Widget Bundle + SwiftUI views belong to the Widget Extension target;
  # the Expo config plugin copies them there.
  s.source_files = 'ios/PushrActivityModule.swift', 'ios/PushrActivityAttributes.swift'
end
