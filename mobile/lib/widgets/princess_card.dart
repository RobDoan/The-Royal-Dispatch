import 'package:flutter/material.dart';
import 'package:royal_dispatch/models/princess.dart';
import 'package:royal_dispatch/theme.dart';
import 'package:royal_dispatch/widgets/glass_card.dart';

class PrincessCard extends StatefulWidget {
  final String princessId;
  final VoidCallback onTap;
  final bool isPoster;
  final bool isLoading;

  const PrincessCard({
    super.key,
    required this.princessId,
    required this.onTap,
    this.isPoster = false,
    this.isLoading = false,
  });

  @override
  State<PrincessCard> createState() => _PrincessCardState();
}

class _PrincessCardState extends State<PrincessCard> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 120),
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.96).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails details) => _controller.forward();
  void _onTapUp(TapUpDetails details) => _controller.reverse();
  void _onTapCancel() => _controller.reverse();

  @override
  Widget build(BuildContext context) {
    final meta = princessMeta[widget.princessId];
    if (meta == null) return const SizedBox.shrink();

    return GestureDetector(
      onTap: widget.onTap,
      onTapDown: _onTapDown,
      onTapUp: _onTapUp,
      onTapCancel: _onTapCancel,
      child: ScaleTransition(
        scale: _scaleAnimation,
        child: widget.isPoster ? _buildPoster(meta) : _buildListTile(meta),
      ),
    );
  }

  Widget _buildListTile(PrincessMeta meta) {
    return GlassCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          // Character image
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              width: 56,
              height: 56,
              child: Image.asset(
                princessImagePath(widget.princessId),
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => Container(
                  decoration: BoxDecoration(
                    gradient: RoyalColors.goldGradient,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Center(
                    child: Text(
                      meta.emoji,
                      style: const TextStyle(fontSize: 24),
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Name and origin
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  meta.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  meta.origin,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.6),
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
          // Emoji badge
          Text(
            meta.emoji,
            style: const TextStyle(fontSize: 20),
          ),
          const SizedBox(width: 8),
          // Chevron
          Icon(
            Icons.chevron_right,
            color: Colors.white.withValues(alpha: 0.5),
            size: 20,
          ),
        ],
      ),
    );
  }

  Widget _buildPoster(PrincessMeta meta) {
    return AspectRatio(
      aspectRatio: 1,
      child: GlassCard(
        borderRadius: 20,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Full-bleed image
              Image.asset(
                princessImagePath(widget.princessId),
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        meta.overlayColor.withValues(alpha: 0.8),
                        RoyalColors.backgroundStart,
                      ],
                    ),
                  ),
                  child: Center(
                    child: Text(
                      meta.emoji,
                      style: const TextStyle(fontSize: 48),
                    ),
                  ),
                ),
              ),
              // Gradient overlay
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      Colors.black.withValues(alpha: 0.65),
                    ],
                    stops: const [0.4, 1.0],
                  ),
                ),
              ),
              // Emoji badge top-right
              Positioned(
                top: 10,
                right: 10,
                child: Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.35),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    meta.emoji,
                    style: const TextStyle(fontSize: 18),
                  ),
                ),
              ),
              // Name + origin bottom-left
              Positioned(
                left: 12,
                right: 12,
                bottom: 12,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      meta.name,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        shadows: [Shadow(color: Colors.black, blurRadius: 4)],
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      meta.origin,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.75),
                        fontSize: 11,
                        shadows: const [Shadow(color: Colors.black, blurRadius: 4)],
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              // Loading overlay
              if (widget.isLoading)
                Container(
                  color: Colors.black.withValues(alpha: 0.5),
                  child: const Center(
                    child: CircularProgressIndicator(
                      valueColor: AlwaysStoppedAnimation<Color>(RoyalColors.gold),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
