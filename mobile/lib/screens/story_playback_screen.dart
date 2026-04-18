import 'package:flutter/material.dart';

class StoryPlaybackScreen extends StatelessWidget {
  final String princess;
  final bool useSSE;

  const StoryPlaybackScreen({
    super.key,
    required this.princess,
    required this.useSSE,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(child: Text('StoryPlaybackScreen: $princess')),
    );
  }
}
